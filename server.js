
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const app = express();
const port = process.env.PORT || 8081;

// Simple file logger
const logError = (error) => {
    const logMessage = `[${new Date().toISOString()}] ${error.stack || error}\n`;
    fs.appendFile('error.log', logMessage, (err) => {
        if (err) console.error('Failed to write to log file:', err);
    });
};

// Environment variables
const region = process.env.AWS_REGION || 'us-east-1';
const dynamoDbTableName = process.env.DYNAMODB_TABLE_NAME;
const s3BucketName = process.env.S3_BUCKET_NAME;

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AWS SDK Clients
const bedrockClient = new BedrockRuntimeClient({ region });
const s3Client = new S3Client({ region });
const ddbClient = new DynamoDBClient({ region });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Retry mechanism with exponential backoff
const retry = async (fn, retries = 5, delay = 1000) => {
    try {
        return await fn();
    } catch (error) {
        if (retries > 0 && (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException' || error.name === 'ProvisionedThroughputExceededException')) {
            logError(`Retrying due to ${error.name}. Retries left: ${retries}. Waiting ${delay}ms.`);
            await new Promise(res => setTimeout(res, delay));
            return retry(fn, retries - 1, delay * 2);
        } else {
            throw error;
        }
    }
};


// Function to find and parse JSON from a string
const extractAndParseJson = (text) => {
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error('No valid JSON object found in the model response.');
    }

    const jsonString = text.substring(startIndex, endIndex + 1);
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        throw new Error(`Failed to parse the extracted JSON object: ${e.message}. Raw string: ${jsonString}`);
    }
};


// Multer setup for handling file uploads in memory
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit for file uploads
    }
});

// Increase payload limits for JSON requests (especially for base64 images)
app.use(express.json({ 
    limit: '50mb' // Use larger limit from remote
}));
app.use(express.urlencoded({ 
    limit: '50mb', 
    extended: true 
}));

// Configure server timeout for large payloads
app.use((req, res, next) => {
    // Set timeout to 5 minutes for large requests
    req.setTimeout(300000);
    res.setTimeout(300000);
    
    // Add CORS headers for corporate network compatibility
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// API endpoint for Bedrock
app.post('/api/generate', async (req, res) => {
    const { prompt, expectJson, imagePayload } = req.body;
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }

    const messages = [{ role: 'user', content: [] }];

    if (imagePayload) {
        messages[0].content.push({
            type: 'image',
            source: {
                type: 'base64',
                media_type: imagePayload.mimeType,
                data: imagePayload.data,
            },
        });
    }
    messages[0].content.push({ type: 'text', text: prompt });

    const params = {
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 4096,
            messages,
        }),
    };
    try {
        const command = new InvokeModelCommand(params);
        const response = await retry(() => bedrockClient.send(command));
        const decodedResponseBody = new TextDecoder().decode(response.body);
        const responseBody = JSON.parse(decodedResponseBody);
        let content = responseBody.content[0].text;

        if (expectJson) {
            content = JSON.stringify(extractAndParseJson(content));
        }
        res.json({ response: content });
    } catch (error) {
        logError(error);
        res.status(500).json({ 
            error: 'Failed to invoke Bedrock model', 
            details: error.message, 
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    }
});

// API endpoint to get all analyses
app.get('/api/analyses', async (req, res) => {
    const params = {
        TableName: dynamoDbTableName,
    };
    try {
        const command = new ScanCommand(params);
        const data = await ddbDocClient.send(command);
        
        // Generate presigned URLs for images
        for (const item of data.Items) {
            if (item.s3Key) {
                const command = new GetObjectCommand({ Bucket: s3BucketName, Key: item.s3Key });
                item.imageUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
            }
        }

        res.json(data.Items);
    } catch (error) {
        console.error('Error fetching analyses from DynamoDB:', error);
        res.status(500).json({ error: 'Failed to fetch analyses' });
    }
});

// API endpoint to save a new analysis
app.post('/api/analyses', upload.single('imageFile'), async (req, res) => {
    const analysisData = req.body;
    const imageFile = req.file;
    const analysisId = uuidv4();
    let s3Key = null;

    // Upload image to S3 if it exists
    if (imageFile) {
        s3Key = `uploads/${analysisId}-${imageFile.originalname}`;
        const s3Params = {
            Bucket: s3BucketName,
            Key: s3Key,
            Body: imageFile.buffer,
            ContentType: imageFile.mimetype,
        };
        try {
            const command = new PutObjectCommand(s3Params);
            await s3Client.send(command);
        } catch (error) {
            logError(`Error uploading image to S3: ${error.message}`);
            return res.status(500).json({ error: 'Failed to upload image' });
        }
    }

    // Save analysis to DynamoDB
    const dynamoDbParams = {
        TableName: dynamoDbTableName,
        Item: {
            analysisId: analysisId,
            title: analysisData.title,
            createdAt: new Date().toISOString(),
            analysisResult: JSON.parse(analysisData.analysisResult),
            aiDescription: analysisData.aiDescription,
            dfdDescription: analysisData.dfdDescription,
            originalDescription: analysisData.originalDescription,
            appType: analysisData.appType,
            dataClassification: analysisData.dataClassification,
            s3Key: s3Key,
        },
    };

    try {
        const command = new PutCommand(dynamoDbParams);
        await ddbDocClient.send(command);
        res.status(201).json({ message: 'Analysis saved successfully', analysisId });
    } catch (error) {
        logError(`Error saving analysis to DynamoDB: ${error.message}`);
        res.status(500).json({ error: 'Failed to save analysis' });
    }
});


// The "catchall" handler
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/index.html'));
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
