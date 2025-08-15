
import React, { useState, useCallback, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import {
  AnalysisResult, ApplicationType, DataClassification, AnalysisStep, ThreatStatus, Threat, Analysis,
  ApplicationTypeTranslations, DataClassificationTranslations, ThreatStatusTranslations, StrideCategoryTranslations
} from './types';
import { generateArchitectureDescription, generateDfd, generateThreats } from './services/bedrockService';

import ThreatAnalysisCard from './components/ThreatAnalysisCard';
import Loader from './components/Loader';
import StyledSelect from './components/StyledSelect';
import Stepper from './components/Stepper';
import Dashboard from './components/Dashboard';

import { AlertTriangle, ShieldCheck, UploadCloud, X, Image as ImageIcon, ArrowLeft, Download, RefreshCw, PlusCircle, Trash2 } from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'analysis'>('dashboard');
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // --- Inputs ---
  const [title, setTitle] = useState<string>('');
  const [architectureDescription, setArchitectureDescription] = useState<string>('');
  const [appType, setAppType] = useState<ApplicationType>(ApplicationType.WEB);
  const [dataClassification, setDataClassification] = useState<DataClassification>(DataClassification.CONFIDENTIAL);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // --- Analysis Flow State ---
  const [currentStep, setCurrentStep] = useState<AnalysisStep>(AnalysisStep.INPUT);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // --- Step Outputs ---
  const [aiDescription, setAiDescription] = useState<string>('');
  const [dfdDescription, setDfdDescription] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const canProceedFromInput = useMemo(() => {
    return !isLoading && title.trim() !== '' && (architectureDescription.trim() !== '' || imageFile !== null);
  }, [isLoading, title, architectureDescription, imageFile]);

  const resetState = useCallback(() => {
    setTitle('');
    setArchitectureDescription('');
    setAppType(ApplicationType.WEB);
    setDataClassification(DataClassification.CONFIDENTIAL);
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setCurrentStep(AnalysisStep.INPUT);
    setAnalysisResult(null);
    setAiDescription('');
    setDfdDescription('');
    setError(null);
    setIsLoading(false);
    setCurrentAnalysisId(null);
    setShowDeleteConfirm(false);
    setIsDeleting(false);
  }, [imagePreview]);

  const handleStartNewAnalysis = () => {
    resetState();
    setCurrentView('analysis');
  };

  const compressImage = (file: File, quality: number = 0.7): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions (max 1920x1080 to reduce payload size)
        let { width, height } = img;
        const maxWidth = 1920;
        const maxHeight = 1080;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const handlePrimaryAction = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (currentStep === AnalysisStep.INPUT) {
        let imagePayload: { mimeType: string; data: string } | undefined = undefined;
        if (imageFile) {
          const compressedFile = await compressImage(imageFile);
          const base64Data = await fileToBase64(compressedFile);
          imagePayload = { mimeType: compressedFile.type, data: base64Data };
        }
        const result = await generateArchitectureDescription(architectureDescription, appType, dataClassification, imagePayload);
        setAiDescription(result);
        setCurrentStep(AnalysisStep.REVIEW_DESCRIPTION);
      } else if (currentStep === AnalysisStep.REVIEW_DESCRIPTION) {
        let imagePayload: { mimeType: string; data: string } | undefined = undefined;
        if (imageFile) {
          const compressedFile = await compressImage(imageFile);
          const base64Data = await fileToBase64(compressedFile);
          imagePayload = { mimeType: compressedFile.type, data: base64Data };
        }
        const result = await generateDfd(aiDescription, imagePayload);
        setDfdDescription(result);
        setCurrentStep(AnalysisStep.REVIEW_DFD);
      } else if (currentStep === AnalysisStep.REVIEW_DFD) {
        const result = await generateThreats(dfdDescription, appType, dataClassification);
        setAnalysisResult(result);
        setCurrentStep(AnalysisStep.RESULTS);
      }
    } catch (e) {
      console.error(e);
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('Ocorreu um erro desconhecido durante a análise.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentStep, architectureDescription, appType, dataClassification, imageFile, aiDescription, dfdDescription]);

  const handleBack = () => {
    setError(null);
    if (currentStep === AnalysisStep.REVIEW_DESCRIPTION) setCurrentStep(AnalysisStep.INPUT);
    else if (currentStep === AnalysisStep.REVIEW_DFD) setCurrentStep(AnalysisStep.REVIEW_DESCRIPTION);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    if(imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  };
  
  const handleThreatStatusChange = (threatId: string, status: ThreatStatus) => {
    setAnalysisResult(prevResult => {
      if (!prevResult) return null;
      return { ...prevResult, threats: prevResult.threats.map(threat => threat.threat_id === threatId ? { ...threat, status } : threat) };
    });
  };

  const handleViewAnalysis = (analysis: Analysis) => {
    setTitle(analysis.title);
    setArchitectureDescription(analysis.originalDescription);
    setAppType(analysis.appType);
    setDataClassification(analysis.dataClassification);
    setImageFile(null);
    setImagePreview(analysis.imageUrl !== 'N/A' ? analysis.imageUrl : null);
    setAiDescription(analysis.aiDescription);
    setDfdDescription(analysis.dfdDescription);
    setAnalysisResult(analysis.analysisResult);
    setCurrentAnalysisId(analysis.id);
    setCurrentStep(AnalysisStep.RESULTS);
    setCurrentView('analysis');
  };

  const handleBackToDashboard = () => {
    resetState();
    setCurrentAnalysisId(null);
    setCurrentView('dashboard');
  };

  const handleDeleteAnalysis = async () => {
    if (!currentAnalysisId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/analyses/${currentAnalysisId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete analysis');
      }

      setShowDeleteConfirm(false);
      handleBackToDashboard();
    } catch (err) {
      console.error("Failed to delete analysis", err);
      if (err instanceof Error) {
        setError(`Falha ao excluir a análise: ${err.message}`);
      } else {
        setError("Falha ao excluir a análise. Ocorreu um erro desconhecido.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveAndReturn = async () => {
    if (!analysisResult) return;

    setIsLoading(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('appType', appType);
    formData.append('dataClassification', dataClassification);
    formData.append('originalDescription', architectureDescription);
    formData.append('aiDescription', aiDescription);
    formData.append('dfdDescription', dfdDescription);
    formData.append('analysisResult', JSON.stringify(analysisResult));
    if (imageFile) {
      formData.append('imageFile', imageFile);
    }

    try {
      const response = await fetch('/api/analyses', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error('Failed to save analysis');
      }
      setCurrentView('dashboard');
      resetState();
    } catch (err) {
      console.error("Failed to save analysis", err);
      if (err instanceof Error) {
        setError(`Falha ao salvar a análise: ${err.message}`);
      } else {
        setError("Falha ao salvar a análise. Ocorreu um erro desconhecido.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const margin = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const contentWidth = pageWidth - margin * 2;
        let y = margin;

        const addWrappedText = (text: string, x: number, startY: number, options: { fontSize: number, style?: 'normal' | 'bold', maxWidth: number }) => {
            doc.setFontSize(options.fontSize);
            doc.setFont('helvetica', options.style || 'normal');
            const lines = doc.splitTextToSize(text, options.maxWidth);
            
            const textHeight = lines.length * (options.fontSize / 2.8);
            if (startY + textHeight > pageHeight - margin) {
                doc.addPage();
                startY = margin;
            }
            
            doc.text(lines, x, startY);
            return startY + textHeight;
        };

        // --- Title Page ---
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text(title || 'Relatório de IA Threat Modeling', pageWidth / 2, y, { align: 'center' });
        y += 15;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Relatório Gerado: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth / 2, y, { align: 'center' });
        y += 20;

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Dados de Entrada da Análise', margin, y);
        y += 10;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Tipo de Aplicação: ${ApplicationTypeTranslations[appType]}`, margin, y);
        y += 7;
        doc.text(`Classificação dos Dados: ${DataClassificationTranslations[dataClassification]}`, margin, y);
        y += 7;

        // --- Architecture Page ---
        doc.addPage();
        y = margin;
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Arquitetura do Sistema', margin, y);
        y += 10;
        
        y = addWrappedText(`Descrição Fornecida pelo Usuário: ${architectureDescription || 'N/A'}`, margin, y, { fontSize: 12, maxWidth: contentWidth });
        y += 10;

        if (imagePreview) {
            y = addWrappedText(`Diagrama Fornecido:`, margin, y, { fontSize: 12, maxWidth: contentWidth });
            y += 5;
            await new Promise(resolve => {
                const img = new Image();
                img.crossOrigin = "anonymous"; // Required for cross-origin images
                img.src = imagePreview;
                img.onload = () => {
                    const imgProps = doc.getImageProperties(img);
                    const aspectRatio = imgProps.width / imgProps.height;
                    let imgWidth = contentWidth;
                    let imgHeight = imgWidth / aspectRatio;
                    if (y + imgHeight > pageHeight - margin) {
                        doc.addPage();
                        y = margin;
                    }
                    doc.addImage(img, 'PNG', margin, y, imgWidth, imgHeight);
                    y += imgHeight;
                    resolve(null);
                };
                img.onerror = () => {
                    console.error("Failed to load image for PDF export");
                    resolve(null); // Continue without the image
                }
            });
             y += 10;
        }

        y = addWrappedText(`Descrição Gerada pela IA: ${aiDescription}`, margin, y, { fontSize: 12, maxWidth: contentWidth });

        // --- DFD Page ---
        doc.addPage();
        y = margin;
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Detalhes do Diagrama de Fluxo de Dados (DFD)', margin, y);
        y += 10;
        addWrappedText(dfdDescription, margin, y, { fontSize: 11, maxWidth: contentWidth, style: 'normal'});
        
        // --- Threats Page ---
        doc.addPage();
        y = margin;
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Resultados da Análise de Ameaças', margin, y);
        y += 15;

        analysisResult?.threats.forEach((threat: Threat) => {
            const threatBlockHeight = 60 + doc.splitTextToSize(threat.description, contentWidth - 10).length * 4 + doc.splitTextToSize(threat.mitigation, contentWidth - 10).length * 4;
            if (y + threatBlockHeight > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }

            doc.setDrawColor(100, 100, 100);
            doc.roundedRect(margin, y, contentWidth, threatBlockHeight, 3, 3, 'S');

            let innerY = y + 10;

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(threat.threat_name, margin + 5, innerY);
            
            const statusText = `Status: ${ThreatStatusTranslations[threat.status]}`;
            const statusWidth = doc.getTextWidth(statusText);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(statusText, pageWidth - margin - 5 - statusWidth, innerY -1);

            innerY += 8;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`Categoria: ${StrideCategoryTranslations[threat.stride_category]}`, margin + 5, innerY);
            innerY += 8;
            
            innerY = addWrappedText(`Descrição: ${threat.description}`, margin + 5, innerY, { fontSize: 10, maxWidth: contentWidth - 10 });
            innerY += 5;
            
            innerY = addWrappedText(`Mitigação: ${threat.mitigation}`, margin + 5, innerY, { fontSize: 10, maxWidth: contentWidth - 10, style: 'normal' });

            y += threatBlockHeight + 10;
        });

        const fileName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        doc.save(`Relatorio-IA-Threat-Modeling-${fileName || 'analise'}.pdf`);

    } catch(err) {
        console.error("Failed to generate PDF", err);
        setError("Não foi possível gerar o relatório em PDF.");
    } finally {
        setIsExportingPdf(false);
    }
  };
  
  const Header: React.FC = () => (
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 w-full">
        <div className='flex items-center gap-4'>
            <img src="/cielo_NEG_RGB-01.png" alt="Cielo" className="h-16 w-auto" />
            <div className="bg-cielo-400 p-3 rounded-lg"><ShieldCheck className="w-8 h-8 text-white"/></div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">IA Threat Modeling</h1>
              <p className="text-cielo-300">Análise de Segurança de Arquitetura Automatizada</p>
            </div>
        </div>
      </header>
  );

  const renderAnalysisFlow = () => {
    const primaryButtonTexts: Record<AnalysisStep, string> = {
        [AnalysisStep.INPUT]: 'Gerar Descrição',
        [AnalysisStep.REVIEW_DESCRIPTION]: 'Confirmar e Gerar DFD',
        [AnalysisStep.REVIEW_DFD]: 'Confirmar e Gerar Ameaças',
        [AnalysisStep.RESULTS]: 'Salvar e Voltar ao Painel',
    };

    const renderActionButtons = () => {
        if (currentStep === AnalysisStep.RESULTS) {
          return (
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
                <button onClick={handleSaveAndReturn} disabled={isLoading} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-cielo-400 text-white font-semibold rounded-lg shadow-md hover:bg-cielo-500 transition-all duration-200 disabled:bg-cielo-800 disabled:cursor-not-allowed">
                    {isLoading ? <Loader /> : <Download className="w-5 h-5"/>}
                    Salvar e Voltar ao Painel
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={isExportingPdf}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isExportingPdf ? <><Loader /> Exportando...</> : <><Download className="w-5 h-5"/> Exportar PDF</>}
                </button>
            </div>
          )
        }
    
        return (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-4">
            <div>
              {currentStep > AnalysisStep.INPUT && (
                 <button onClick={handleBack} className="flex items-center gap-2 px-4 py-2 text-gray-400 font-semibold rounded-lg hover:bg-gray-700 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Voltar
                 </button>
              )}
            </div>
            <button
              onClick={handlePrimaryAction}
              disabled={currentStep === AnalysisStep.INPUT && !canProceedFromInput}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-cielo-400 text-white font-semibold rounded-lg shadow-md hover:bg-cielo-500 disabled:bg-cielo-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? <><Loader /> Analisando...</> : primaryButtonTexts[currentStep]}
            </button>
          </div>
        );
      };

    return (
        <div className="w-full max-w-4xl mx-auto">
            <Header />
            <main className="w-full">
            {currentStep === AnalysisStep.INPUT && (
                <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6">
                   <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 mb-6 text-sm text-gray-400 font-semibold rounded-lg hover:text-cielo-400 transition-colors">
                      <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
                   </button>
                  <label htmlFor="title" className="block text-lg font-medium text-gray-300 mb-3">Título da Análise</label>
                  <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex: API de Pagamentos v2"
                    className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-cielo-500 focus:border-cielo-500 transition duration-200 placeholder:text-gray-500"
                    disabled={isLoading}
                  />

                  <label htmlFor="architecture-description" className="block text-lg font-medium text-gray-300 mb-3 mt-4">
                    Descrição da Arquitetura do Sistema
                  </label>
                  <textarea
                    id="architecture-description"
                    rows={6}
                    className="w-full p-4 bg-gray-900 border border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-cielo-500 focus:border-cielo-500 transition duration-200 placeholder:text-gray-500"
                    placeholder="Ex: Uma aplicação web com frontend em React, um backend Node.js com Express, e um banco de dados PostgreSQL..."
                    value={architectureDescription}
                    onChange={(e) => setArchitectureDescription(e.target.value)}
                    disabled={isLoading}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <StyledSelect label="Tipo de Aplicação" value={appType} onChange={e => setAppType(e.target.value as ApplicationType)} options={Object.values(ApplicationType)} translations={ApplicationTypeTranslations} disabled={isLoading}/>
                    <StyledSelect label="Classificação dos Dados" value={dataClassification} onChange={e => setDataClassification(e.target.value as DataClassification)} options={Object.values(DataClassification)} translations={DataClassificationTranslations} disabled={isLoading}/>
                  </div>
                  <div className="mt-4">
                    <label className="block text-lg font-medium text-gray-300 mb-3">Diagrama da Arquitetura (Opcional)</label>
                    {imagePreview ? (
                      <div className="relative group">
                        <img src={imagePreview} alt="Pré-visualização da arquitetura" className="w-full h-auto max-h-80 object-contain rounded-lg border-2 border-gray-600" />
                        <button onClick={removeImage} className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80 transition-opacity opacity-0 group-hover:opacity-100">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <label htmlFor="file-upload" className="relative block w-full border-2 border-gray-600 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-cielo-500 transition-colors">
                        <div className="flex flex-col items-center justify-center">
                          <UploadCloud className="w-12 h-12 text-gray-500 mb-2" />
                          <span className="block text-sm font-semibold text-gray-400">Clique para enviar ou arraste e solte</span>
                          <span className="block text-xs text-gray-500">PNG, JPG, GIF até 10MB</span>
                        </div>
                        <input id="file-upload" name="file-upload" type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/png, image/jpeg, image/gif" onChange={handleFileChange} disabled={isLoading} />
                      </label>
                    )}
                  </div>
                  {renderActionButtons()}
                </div>
              )}

              <div className="mt-8">
                {isLoading && (
                  <div className="flex flex-col items-center justify-center text-center p-8">
                    <Loader />
                    <p className="mt-4 text-lg text-gray-400">A IA está analisando... isso pode levar um momento.</p>
                  </div>
                )}
                
                {error && (
                  <div className="bg-red-900/30 border border-red-500 text-red-300 p-4 rounded-lg flex items-center gap-4">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                    <p className='flex-grow'>{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto bg-red-800/50 text-white font-semibold px-3 py-1 rounded-md hover:bg-red-700">Fechar</button>
                  </div>
                )}
                
                {!isLoading && !error && currentStep > AnalysisStep.INPUT && currentStep < AnalysisStep.RESULTS && (
                  <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6">
                    <Stepper currentStep={currentStep} />
                    {currentStep === AnalysisStep.REVIEW_DESCRIPTION && (
                      <div>
                        <label htmlFor="ai-description" className="block text-lg font-medium text-gray-300 mb-3">Revisar e Confirmar a Descrição da Arquitetura</label>
                        <textarea id="ai-description" rows={10} value={aiDescription} onChange={e => setAiDescription(e.target.value)} className="w-full p-4 bg-gray-900 border border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-cielo-500 focus:border-cielo-500 transition duration-200" />
                      </div>
                    )}
                    {currentStep === AnalysisStep.REVIEW_DFD && (
                      <div>
                        <label htmlFor="dfd-description" className="block text-lg font-medium text-gray-300 mb-3">Revisar o Diagrama de Fluxo de Dados (DFD)</label>
                        <div id="dfd-description" className="w-full p-4 bg-gray-900 border border-gray-600 rounded-lg text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap">{dfdDescription}</div>
                      </div>
                    )}
                    {renderActionButtons()}
                  </div>
                )}

                {!isLoading && !error && currentStep === AnalysisStep.RESULTS && analysisResult && (
                  <div>
                    <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 mb-8">
                      <Stepper currentStep={currentStep} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
                    <div className="flex justify-between items-center mb-6">
                      <button onClick={handleBackToDashboard} className="flex items-center gap-2 text-sm text-gray-400 font-semibold rounded-lg hover:text-cielo-400 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
                      </button>
                      {currentAnalysisId && (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-red-400 bg-red-900/20 rounded-lg hover:bg-red-900/40 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir Análise
                        </button>
                      )}
                    </div>
                    {imagePreview && (
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-gray-300 mb-3">Diagrama de Arquitetura</h3>
                        <img src={imagePreview} alt="Diagrama de Arquitetura" className="w-full h-auto max-h-96 object-contain rounded-lg border border-gray-700" />
                      </div>
                    )}
                    <h3 className="text-xl font-semibold text-gray-300 mb-3">Descrição da Arquitetura</h3>
                    <div className="w-full p-4 bg-gray-900 border border-gray-600 rounded-lg text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap mb-6">{aiDescription}</div>

                    <h3 className="text-xl font-semibold text-gray-300 mb-3">Diagrama de Fluxo de Dados (DFD)</h3>
                    <div className="w-full p-4 bg-gray-900 border border-gray-600 rounded-lg text-gray-200 prose prose-invert prose-sm max-w-none whitespace-pre-wrap mb-6">{dfdDescription}</div>

                    <h3 className="text-xl font-semibold text-gray-300 mb-6">Ameaças Identificadas</h3>
                    {analysisResult.threats.length > 0 ? (
                        <div className="grid grid-cols-1 gap-6">
                        {analysisResult.threats.map((threat) => (
                            <ThreatAnalysisCard key={threat.threat_id} threat={threat} onStatusChange={handleThreatStatusChange} />
                        ))}
                        </div>
                    ) : (
                        <div className="text-center p-8 bg-gray-800 rounded-lg border border-gray-700">
                            <ImageIcon className="w-12 h-12 mx-auto text-gray-500 mb-4" />
                            <h3 className="text-xl font-semibold text-white">Nenhuma Ameaça Identificada</h3>
                            <p className="text-gray-400 mt-2">A análise da IA não encontrou nenhuma ameaça específica com base nas informações fornecidas.</p>
                        </div>
                    )}
                    {renderActionButtons()}
                  </div>
                )}
              </div>
            </main>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center p-4 sm:p-6 lg:p-8">
       {currentView === 'dashboard' ? (
         <div className="w-full max-w-4xl mx-auto">
            <Header />
            <Dashboard onViewAnalysis={handleViewAnalysis} />
             <div className="flex justify-center mt-8">
                 <button
                     onClick={handleStartNewAnalysis}
                     className="flex items-center gap-2 px-5 py-2.5 bg-cielo-400 text-white font-semibold rounded-lg shadow-md hover:bg-cielo-500 transition-all duration-200"
                 >
                     <PlusCircle className="w-5 h-5" />
                     Nova Análise
                 </button>
             </div>
         </div>
      ) : (
        renderAnalysisFlow()
      )}

      {/* Modal de Confirmação de Exclusão */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-900/30 rounded-full">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-xl font-bold" style={{ color: '#ffffff' }}>Confirmar Exclusão</h3>
            </div>
            <p className="mb-6" style={{ color: '#d1d5db' }}>
              Tem certeza que deseja excluir esta análise? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-gray-400 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAnalysis}
                disabled={isDeleting}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: '#dc2626' }}
              >
                {isDeleting ? (
                  <>
                    <Loader />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
