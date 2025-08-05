import React from 'react';
import { Threat, StrideCategory, ThreatStatus, StrideCategoryTranslations, ThreatStatusTranslations } from '../types';
import { ShieldAlert, ShieldCheck, User, KeyRound, FileLock, WifiOff, ChevronsUp, HelpCircle, CheckCircle2, XCircle } from 'lucide-react';


const StrideIcon: React.FC<{ category: StrideCategory }> = ({ category }) => {
    const iconProps = { className: "w-5 h-5 flex-shrink-0" };
    switch (category) {
        case StrideCategory.SPOOFING:
            return <User {...iconProps} />;
        case StrideCategory.TAMPERING:
            return <KeyRound {...iconProps} />;
        case StrideCategory.REPUDIATION:
            return <FileLock {...iconProps} />;
        case StrideCategory.INFORMATION_DISCLOSURE:
            return <ShieldAlert {...iconProps} />;
        case StrideCategory.DENIAL_OF_SERVICE:
            return <WifiOff {...iconProps} />;
        case StrideCategory.ELEVATION_OF_PRIVILEGE:
            return <ChevronsUp {...iconProps} />;
        default:
            return <HelpCircle {...iconProps} />;
    }
};

const getCategoryColor = (category: StrideCategory): string => {
    switch (category) {
        case StrideCategory.SPOOFING: return 'bg-yellow-900 text-yellow-300 border-yellow-700';
        case StrideCategory.TAMPERING: return 'bg-orange-900 text-orange-300 border-orange-700';
        case StrideCategory.REPUDIATION: return 'bg-pink-900 text-pink-300 border-pink-700';
        case StrideCategory.INFORMATION_DISCLOSURE: return 'bg-red-900 text-red-300 border-red-700';
        case StrideCategory.DENIAL_OF_SERVICE: return 'bg-purple-900 text-purple-300 border-purple-700';
        case StrideCategory.ELEVATION_OF_PRIVILEGE: return 'bg-rose-900 text-rose-300 border-rose-700';
        default: return 'bg-gray-700 text-gray-300 border-gray-600';
    }
}

const getStatusStyles = (status: ThreatStatus): string => {
    switch (status) {
        case ThreatStatus.ACCEPTED:
            return 'border-green-600/50 bg-gray-800 hover:border-green-600';
        case ThreatStatus.REJECTED:
            return 'border-gray-700 bg-gray-800/60 opacity-60 hover:border-gray-600';
        case ThreatStatus.PENDING:
        default:
            return 'border-gray-700 bg-gray-800/50 hover:border-indigo-600 hover:shadow-indigo-900/40';
    }
};

interface ThreatAnalysisCardProps {
    threat: Threat;
    onStatusChange: (threatId: string, status: ThreatStatus) => void;
}

const ThreatAnalysisCard: React.FC<ThreatAnalysisCardProps> = ({ threat, onStatusChange }) => {
  const isPending = threat.status === ThreatStatus.PENDING;

  return (
    <div className={`border rounded-xl shadow-lg overflow-hidden transition-all duration-300 ${getStatusStyles(threat.status)}`}>
      <div className="p-5">
        <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3 mb-4">
          <h3 className="text-xl font-bold text-white leading-tight">{threat.threat_name}</h3>
          <div className="flex items-center gap-4">
            {threat.status !== ThreatStatus.PENDING && (
                <div className={`px-3 py-1 text-sm font-semibold rounded-full ${threat.status === ThreatStatus.ACCEPTED ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {ThreatStatusTranslations[threat.status]}
                </div>
            )}
            <div className={`flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-full border ${getCategoryColor(threat.stride_category)}`}>
                <StrideIcon category={threat.stride_category} />
                <span>{StrideCategoryTranslations[threat.stride_category]}</span>
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
            <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-1">Descrição</h4>
                <p className="text-gray-300">{threat.description}</p>
            </div>
            
            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700/80">
                <h4 className="flex items-center gap-2 text-md font-semibold text-green-400 mb-2">
                    <ShieldCheck className="w-5 h-5" />
                    Mitigação Recomendada
                </h4>
                <p className="text-gray-300">{threat.mitigation}</p>
            </div>
        </div>

        {isPending && (
             <div className="mt-5 pt-4 border-t border-gray-700 flex justify-end items-center gap-3">
                <button
                    onClick={() => onStatusChange(threat.threat_id, ThreatStatus.REJECTED)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-400 rounded-md hover:bg-red-900/50 transition-colors"
                >
                    <XCircle className="w-5 h-5"/>
                    Rejeitar
                </button>
                 <button
                    onClick={() => onStatusChange(threat.threat_id, ThreatStatus.ACCEPTED)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-green-400 bg-green-900/50 rounded-md hover:bg-green-800/70 transition-colors"
                >
                    <CheckCircle2 className="w-5 h-5"/>
                    Aceitar
                </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default ThreatAnalysisCard;