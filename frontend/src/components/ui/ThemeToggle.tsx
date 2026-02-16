import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../ThemeProvider';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'background-color 0.2s',
        color: 'var(--text-color)',
      }}
      aria-label="Toggle Theme"
      className="theme-toggle-btn"
    >
      {theme === 'light' ? (
        <Moon size={24} />
      ) : (
        <Sun size={24} />
      )}
    </button>
  );
};

export default ThemeToggle;
