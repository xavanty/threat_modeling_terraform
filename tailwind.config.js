import { type Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cielo: {
          50: '#f0f7ff',
          100: '#e6f3ff', 
          200: '#bae0ff',
          300: '#8fcdff',
          400: '#66A3E0',  // Azul claro Cielo
          500: '#0066CC',  // Azul principal Cielo
          600: '#0052a3',
          700: '#003d7a',
          800: '#003366',  // Azul escuro Cielo
          900: '#002347'
        }
      }
    },
  },
} satisfies Config;