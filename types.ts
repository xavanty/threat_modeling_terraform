export enum StrideCategory {
  SPOOFING = 'Spoofing',
  TAMPERING = 'Tampering',
  REPUDIATION = 'Repudiation',
  INFORMATION_DISCLOSURE = 'Information Disclosure',
  DENIAL_OF_SERVICE = 'Denial of Service',
  ELEVATION_OF_PRIVILEGE = 'Elevation of Privilege',
  UNKNOWN = 'Unknown'
}

export enum ApplicationType {
  LOGICAL_APP = 'Logical Application',
  LOGICAL_SUB = 'Logical Application Subcomponent',
  BASH = 'Bash',
  ANDROID = 'Android App',
  WEB = 'Web',
  API = 'API'
}

export enum DataClassification {
  PUBLIC = 'Public',
  INTERNAL = 'Internal',
  CONFIDENTIAL = 'Confidential',
  RESTRICTED = 'Restricted',
  PCI_DSS = 'PCI-DSS'
}

export enum AnalysisStep {
  INPUT,
  REVIEW_DESCRIPTION,
  REVIEW_DFD,
  RESULTS,
}

export enum ThreatStatus {
  PENDING = 'Pending',
  ACCEPTED = 'Accepted',
  REJECTED = 'Rejected',
}

export interface Threat {
  threat_id: string;
  threat_name: string;
  description: string;
  stride_category: StrideCategory;
  mitigation: string;
  status: ThreatStatus;
}

export interface AnalysisResult {
  threats: Threat[];
}

export interface Analysis {
  id: string;
  userId: string;
  createdAt: number;
  title: string;
  appType: ApplicationType;
  dataClassification: DataClassification;
  originalDescription: string;
  imageFileName: string | null;
  aiDescription: string;
  dfdDescription: string;
  analysisResult: AnalysisResult;
}

// Translation Maps
export const StrideCategoryTranslations: Record<StrideCategory, string> = {
  [StrideCategory.SPOOFING]: 'Falsificação',
  [StrideCategory.TAMPERING]: 'Adulteração',
  [StrideCategory.REPUDIATION]: 'Repúdio',
  [StrideCategory.INFORMATION_DISCLOSURE]: 'Divulgação de Informação',
  [StrideCategory.DENIAL_OF_SERVICE]: 'Negação de Serviço',
  [StrideCategory.ELEVATION_OF_PRIVILEGE]: 'Elevação de Privilégio',
  [StrideCategory.UNKNOWN]: 'Desconhecido'
};

export const ApplicationTypeTranslations: Record<ApplicationType, string> = {
  [ApplicationType.LOGICAL_APP]: 'Aplicação Lógica',
  [ApplicationType.LOGICAL_SUB]: 'Subcomponente de Aplicação Lógica',
  [ApplicationType.BASH]: 'Script Bash',
  [ApplicationType.ANDROID]: 'Aplicativo Android',
  [ApplicationType.WEB]: 'Web',
  [ApplicationType.API]: 'API'
};

export const DataClassificationTranslations: Record<DataClassification, string> = {
  [DataClassification.PUBLIC]: 'Público',
  [DataClassification.INTERNAL]: 'Interno',
  [DataClassification.CONFIDENTIAL]: 'Confidencial',
  [DataClassification.RESTRICTED]: 'Restrito',
  [DataClassification.PCI_DSS]: 'PCI-DSS'
};

export const ThreatStatusTranslations: Record<ThreatStatus, string> = {
    [ThreatStatus.PENDING]: 'Pendente',
    [ThreatStatus.ACCEPTED]: 'Aceito',
    [ThreatStatus.REJECTED]: 'Rejeitado',
};