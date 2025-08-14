# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Local Development
```bash
# Install dependencies
npm install

# Run development environment (starts both frontend and backend)
npm run dev
# This starts:
# - Backend server on port 8081 (Node.js/Express)
# - Frontend dev server on port 5173 (Vite/React) with API proxy

# Run backend only
npm run start

# Build production version
npm run build
```

### Docker Development
```bash
# Build and run with Docker Compose
docker-compose up --build

# Run with existing AWS credentials mounted
# App runs on port 8081
```

### Testing and Deployment
```bash
# Terraform deployment (requires AWS credentials and GitHub connection)
cd terraform
terraform init
terraform apply -var="github_connection_arn=YOUR_ARN"
```

## Architecture Overview

This is an AI-powered threat modeling application that generates security analysis using AWS Bedrock (Claude 3 Sonnet) following the STRIDE methodology.

### Core Components

**Frontend (React/TypeScript/Vite)**
- `App.tsx` - Main application router and state management
- `components/` - React components for UI
  - `Dashboard.tsx` - Analysis history and management
  - `Stepper.tsx` - Multi-step analysis workflow
  - `ThreatAnalysisCard.tsx` - Displays threat analysis results
- Multi-step workflow: Input → Review Description → Review DFD → Results

**Backend (Node.js/Express)**
- `server.js` - Main Express server with integrated AWS SDK clients
- Routes: `/api/generate` (Bedrock), `/api/analyses` (CRUD)
- File uploads handled via multer with S3 storage
- Serves built React app as static files

**AI Integration**
- `services/bedrockService.ts` - AWS Bedrock API wrapper
- `prompts/` - AI prompt templates for different analysis phases
  - `architectureDescriptionPrompt.ts` - Architecture enhancement
  - `dfdGeneratorPrompt.ts` - Data Flow Diagram generation  
  - `threatModelerPrompt.ts` - STRIDE-based threat analysis

**Data Layer**
- AWS DynamoDB for analysis persistence
- AWS S3 for uploaded architecture diagrams
- `types.ts` - TypeScript interfaces for STRIDE categories, threat data

### Key Patterns

- **Three-stage AI pipeline**: User description → AI-enhanced description → DFD → Threat analysis
- **AWS SDK integration**: Direct AWS service calls with retry logic and exponential backoff
- **Multilingual support**: Portuguese UI with English AI processing
- **File upload workflow**: Images stored in S3 with presigned URL generation
- **Error handling**: Centralized error logging with development vs production modes

## Environment Configuration

### Required Environment Variables
```bash
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=ia-threat-modeling-history
S3_BUCKET_NAME=ia-threat-modeling-uploads-xxxxxxxx
```

### AWS Services Used
- **Bedrock**: Claude 3 Sonnet model for threat analysis
- **DynamoDB**: Analysis history and metadata storage
- **S3**: Architecture diagram storage with presigned URLs
- **App Runner**: Production deployment target

## Infrastructure

- **Terraform**: Infrastructure as code in `terraform/` directory
- **GitHub Actions**: CI/CD pipeline in `.github/workflows/deploy.yml`
- **Docker**: Containerized deployment with `Dockerfile`
- **Vite**: Frontend bundler with API proxy configuration for development

## Development Notes

- Frontend development server proxies `/api/*` requests to port 8081
- Backend serves React build from `/dist` directory in production
- Images are processed as base64 for AI analysis and stored in S3 for persistence
- TypeScript strict mode enabled with ES2022 target
- Portuguese UI labels with English backend processing for optimal AI performance

## Payload Size Configuration

For corporate networks or large image uploads, the following limits are configured:
- Express JSON payload limit: 10MB
- Express URL-encoded payload limit: 10MB  
- Multer file upload limit: 10MB
- Server timeout: 5 minutes for large requests
- Image compression: Automatic resize to max 1920x1080 with 70% quality
- CORS headers configured for corporate network compatibility