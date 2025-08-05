import React, { useState, useEffect } from 'react';
import { Analysis } from '../types';
import { FileText, Clock, ChevronRight } from 'lucide-react';
import Loader from './Loader';

interface DashboardProps {
    onViewAnalysis: (analysis: Analysis) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewAnalysis }) => {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalyses = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/analyses');
        if (!response.ok) {
          throw new Error('Failed to fetch analyses');
        }
        const data = await response.json();
        setAnalyses(data);
      } catch (err) {
        setError('Falha ao carregar análises anteriores.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnalyses();
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-white">Painel de Análises</h2>
      </div>

      {loading && <div className="flex justify-center p-8"><Loader /></div>}
      {error && <p className="text-red-400 text-center p-4 bg-red-900/20 rounded-lg">{error}</p>}
      
      {!loading && !error && (
        <div className="space-y-4">
          {analyses.length > 0 ? (
            analyses.map(analysis => (
              <button
                key={analysis.id}
                onClick={() => onViewAnalysis(analysis)}
                className="w-full flex items-center justify-between text-left p-4 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700/70 hover:border-indigo-500 transition-all duration-200"
              >
                <div>
                  <h3 className="font-semibold text-lg text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-400" />
                    {analysis.title}
                  </h3>
                  <p className="text-sm text-gray-400 flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4" />
                    {new Date(analysis.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <ChevronRight className="w-6 h-6 text-gray-500" />
              </button>
            ))
          ) : (
            <div className="text-center p-12 bg-gray-800 rounded-lg border-2 border-dashed border-gray-700">
              <h3 className="text-xl font-semibold text-white">Nenhuma análise encontrada</h3>
              <p className="text-gray-400 mt-2">Clique em "Nova Análise" para começar a proteger seu sistema.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
