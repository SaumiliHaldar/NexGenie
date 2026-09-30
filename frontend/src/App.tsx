import React from 'react';
import Chatbot from './components/Chatbot';
import './App.css';

function App() {
  return (
    <div className="App">
      <main className="landing-container">
        <h1 className="title-text">
          Welcome to <span className="brand">NexGenie</span>!
        </h1>
        <p className="description-text">
          NexGenie is an AI-powered chatbot integrated into the LearnNexus Learning Management System (LMS). It provides real-time academic support, coding assistance, and personalized learning guidance directly within the platform, enhancing user engagement and improving the overall learning experience.
        </p>
        <p className="description-text">
          For a better understanding and experience, visit{' '}
          <a href="https://learnnexus.vercel.app" className="visit-link">LearnNexus</a>
        </p>
      </main>
      <Chatbot />
    </div>
  );
}

export default App;
