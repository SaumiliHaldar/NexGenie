import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './Chatbot.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

const Chatbot = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const messagesEndRef = useRef(null);
    const chatButtonRef = useRef(null);

    // Run only once when component mounts to send the intro message
    useEffect(() => {
        const introMessage = {
            text: "Hello User, NexGenie at your service! How can I assist you today?",
            sender: "bot",
        };
        setMessages([introMessage]);
    }, []);

    // Adding/removing animation based on chatbot's open state
    useEffect(() => {
        if (chatButtonRef.current) {
            if (isOpen) {
                chatButtonRef.current.style.animation = 'none'; // Stop animation when chatbot is open
            } else {
                chatButtonRef.current.style.animation = 'moveUpDown 1.5s ease-in-out infinite'; // Restart animation when chatbot is closed
            }
        }
    }, [isOpen]); // Trigger effect when isOpen changes

    
    const sendMessage = async () => {
        if (input.trim() === '') return;
    
        const userMessage = { text: input, sender: 'user' };
        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setLoading(true);  // Set loading state to true to show typing message
    
        // Add typing indicator for bot
        const typingIndicator = { text: 'typing...', sender: 'bot' };
        setMessages((prev) => [...prev, typingIndicator]);
    
        try {
            // Simple check to see if user is asking about courses
            const isCourseQuery = input.toLowerCase().includes('course');
    
            let response;
    
            if (isCourseQuery) {
                // If it's a course query, hit the ask_course endpoint
                response = await axios.post('https://nexgenie.onrender.com/ask_course', {
                    query: input
                });
    
                // Extract courses and summary from the response
                const [summary, ...courses] = response.data.answer;
    
                // Format bot's course reply
                const botMessages = [
                    { text: summary, sender: 'bot' },
                    ...courses.map((course) => ({
                        text: `📘 *${course.name}*\n\n${course.description}\n\n💡 *Benefits:* ${course.benefits}\n📋 *Level:* ${course.level}\n🎯 *Price:* ₹${course.price}\n📎 *Prerequisites:* ${course.prerequisites}`,
                        sender: 'bot'
                    }))
                ];
    
                // Remove typing and add bot response
                setMessages((prev) => [
                    ...prev.filter(msg => msg.text !== 'typing...'),
                    ...botMessages
                ]);
            } else {
                // Normal code-related request (for code queries)
                response = await axios.post('https://nexgenie.onrender.com/process_query', {
                    queryResult: {
                        parameters: {
                            code: input,
                            programminglanguage: '',
                        },
                    },
                });
    
                const botMessages = response.data.fulfillmentMessages.map((msg) => ({
                    text: msg.text.text[0],
                    sender: 'bot',
                }));
    
                setMessages((prev) => [
                    ...prev.filter(msg => msg.text !== 'typing...'),
                    ...botMessages
                ]);
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setMessages((prev) => [
                ...prev,
                { text: 'Sorry, something went wrong. Please try again.', sender: 'bot' },
            ]);
        } finally {
            setLoading(false);
            scrollToBottom();
        }
    };

    
    const toggleChat = () => {
        setIsOpen(!isOpen);
        // If opening chat, focus input without resetting messages
        if (!isOpen) {
            setTimeout(() => document.getElementById('chat-input').focus(), 300);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="chatbot">
            <div 
                className="chat-button" 
                ref={chatButtonRef}
                onClick={toggleChat}
            >
                <img src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png" alt="Chatbot icon" />
            </div>
            {isOpen && (
                <div className="chat-window">
                    <div className="chat-header">
                        <img src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png" alt="icon" />
                        <span className="chat-title">NexGenie</span>
                        <button className="close-button" onClick={toggleChat}><FontAwesomeIcon icon={faTimes}/></button>
                    </div>
                    <div className="messages">
                        {messages.map((msg, index) => (
                            <div key={index} className={`message ${msg.sender}`}>
                                {msg.sender === 'bot' && (
                                    <img
                                        className="avatar bot-avatar"
                                        src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png"
                                        alt="Bot Avatar"
                                    />
                                )}
                                <div className={`chat-bubble ${msg.sender}`}>
                                    {msg.text}
                                </div>
                                {msg.sender === 'user' && (
                                    <img
                                        className="avatar user-avatar"
                                        src="https://cdn.icon-icons.com/icons2/1378/PNG/512/avatardefault_92824.png"
                                        alt="User Avatar"
                                    />
                                )}
                            </div>
                        ))}
                        {loading && <div className="message bot">typing...</div>}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className="input-area">
                        <input
                            id="chat-input"
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                            placeholder="Type a message..."
                        />
                        <button onClick={sendMessage}>Send</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chatbot;
