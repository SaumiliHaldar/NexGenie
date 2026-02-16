import React from 'react';
import Chatbot from './components/Chatbot';
import { TextGenerateEffect } from './components/ui/text-generate-effect';
import { ThemeProvider } from './components/ThemeProvider';
import ThemeToggle from './components/ui/ThemeToggle';
import './App.css';

function App() {
  return (
    <ThemeProvider>
      <div className="App">
        <ThemeToggle />
        <div className="landing-container">
          <TextGenerateEffect
            words="Welcome to NexGenie!"
            className="title-text"
          />
          <p className="description-text">
            NexGenie is an AI-powered chatbot integrated into the LearnNexus Learning Management System (LMS). It provides real-time academic support, coding assistance, and personalized learning guidance directly within the platform, enhancing user engagement and improving the overall learning experience.
          </p>
          <p className="description-text">
            For a better understanding and experience, visit <a href="https://learnnexus.vercel.app" className="visit-link">LearnNexus</a>
          </p>
        </div>
        <Chatbot />
      </div>
    </ThemeProvider>
  );
}

export default App;
