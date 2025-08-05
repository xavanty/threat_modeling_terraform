import React from 'react';

interface StyledSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: string[];
  translations: Record<string, string>;
}

const StyledSelect: React.FC<StyledSelectProps> = ({ label, options, translations, ...props }) => {
  return (
    <div>
      <label htmlFor={props.id || label} className="block text-sm font-medium text-gray-400 mb-1">
        {label}
      </label>
      <select
        id={props.id || label}
        {...props}
        className="w-full p-2.5 bg-gray-900 border border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {translations[option] || option}
          </option>
        ))}
      </select>
    </div>
  );
};

export default StyledSelect;