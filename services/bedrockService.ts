import { AnalysisResult, ApplicationType, DataClassification } from '../types';
import { ARCHITECTURE_DESCRIPTION_PROMPT } from '../prompts/architectureDescriptionPrompt';
import { DFD_GENERATOR_PROMPT } from '../prompts/dfdGeneratorPrompt';
import { THREAT_MODELER_PROMPT } from '../prompts/threatModelerPrompt';

const callBedrockApi = async (prompt: string, expectJson: boolean = false, imagePayload?: { mimeType: string; data: string }): Promise<any> => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, expectJson, imagePayload }),
  });

  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(errorBody.error || 'Failed to call Bedrock API');
  }

  const data = await response.json();
  if (expectJson) {
    return JSON.parse(data.response);
  } else {
    return data.response;
  }
};

export const generateArchitectureDescription = async (
  description: string,
  appType: ApplicationType,
  dataClassification: DataClassification,
  imagePayload?: { mimeType: string; data: string }
): Promise<string> => {
  const prompt = `${ARCHITECTURE_DESCRIPTION_PROMPT} User description: ${description}, Application type: ${appType}, Data classification: ${dataClassification}`;
  const result = await callBedrockApi(prompt, false, imagePayload);
  return result;
};

export const generateDfd = async (
  aiDescription: string,
  imagePayload?: { mimeType: string; data: string }
): Promise<string> => {
  const prompt = `${DFD_GENERATOR_PROMPT} AI description: ${aiDescription}`;
  const result = await callBedrockApi(prompt, false, imagePayload);
  return result;
};

export const generateThreats = async (
  dfd: string,
  appType: ApplicationType,
  dataClassification: DataClassification
): Promise<AnalysisResult> => {
  const prompt = `${THREAT_MODELER_PROMPT} DFD: ${dfd}, Application type: ${appType}, Data classification: ${dataClassification}`;
  const result = await callBedrockApi(prompt, true);
  return result;
};
