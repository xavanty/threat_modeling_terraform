import React from 'react';
import { Check, Bot, ListChecks, ShieldAlert } from 'lucide-react';
import { AnalysisStep } from '../types';

interface StepProps {
  icon: React.ReactNode;
  title: string;
  isCompleted: boolean;
  isActive: boolean;
}

const Step: React.FC<StepProps> = ({ icon, title, isCompleted, isActive }) => {
  const getStepClasses = () => {
    let classes = 'flex items-center gap-3 p-3 rounded-lg transition-colors duration-300 ';
    if (isActive) {
      classes += 'bg-indigo-600/20 border-indigo-500 text-white';
    } else if (isCompleted) {
      classes += 'bg-gray-700/50 border-gray-600 text-gray-300';
    } else {
      classes += 'bg-gray-800 border-gray-700 text-gray-500';
    }
    return classes;
  };

  return (
    <div className="flex-1">
        <div className={getStepClasses()}>
            <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${isActive ? 'border-indigo-400' : 'border-gray-500'} ${isCompleted ? 'bg-green-500 border-green-400' : ''}`}>
                {isCompleted ? <Check className="w-5 h-5 text-white" /> : icon}
            </div>
            <span className="font-semibold">{title}</span>
        </div>
    </div>
  );
};

const Stepper: React.FC<{ currentStep: AnalysisStep }> = ({ currentStep }) => {
  const steps = [
    { id: AnalysisStep.REVIEW_DESCRIPTION, icon: <Bot className="w-5 h-5" />, title: 'Descrever' },
    { id: AnalysisStep.REVIEW_DFD, icon: <ListChecks className="w-5 h-5" />, title: 'Criar DFD' },
    { id: AnalysisStep.RESULTS, icon: <ShieldAlert className="w-5 h-5" />, title: 'Modelar Ameaças' },
  ];

  const getStepIndex = (stepEnum: AnalysisStep): number => {
    switch(stepEnum) {
        case AnalysisStep.INPUT: return -1;
        case AnalysisStep.REVIEW_DESCRIPTION: return 0;
        case AnalysisStep.REVIEW_DFD: return 1;
        case AnalysisStep.RESULTS: return 2;
        default: return -1;
    }
  }

  const activeIndex = getStepIndex(currentStep);

  return (
    <div className="flex items-center w-full mb-8">
      {steps.map((step, index) => (
        <React.Fragment key={step.title}>
          <Step
            icon={step.icon}
            title={step.title}
            isActive={index === activeIndex}
            isCompleted={index < activeIndex}
          />
          {index < steps.length - 1 && (
            <div className={`flex-none h-0.5 w-8 mx-2 ${index < activeIndex ? 'bg-green-500' : 'bg-gray-600'}`}></div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default Stepper;