import React, { useState, useRef, useEffect, FC } from "react";
import axios from "axios";
import "./Chatbot.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";

interface Message {
  text: string;
  sender: "bot" | "user";
}

const Chatbot: FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatButtonRef = useRef<HTMLDivElement>(null);

  // Run only once when component mounts to send the intro message
  useEffect(() => {
    const introMessage: Message = {
      text: "Hello User, NexGenie at your service! How can I assist you today?",
      sender: "bot",
    };
    setMessages([introMessage]);
  }, []);

  // Adding/removing animation based on chatbot's open state
  useEffect(() => {
    if (chatButtonRef.current) {
      if (isOpen) {
        chatButtonRef.current.style.animation = "none"; // Stop animation when chatbot is open
      } else {
        chatButtonRef.current.style.animation =
          "moveUpDown 1.5s ease-in-out infinite"; // Restart animation when chatbot is closed
      }
    }
  }, [isOpen]); // Trigger effect when isOpen changes

  const sendMessage = async () => {
    if (input.trim() === "") return;

    const userMessage: Message = { text: input, sender: "user" };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true); // Set loading state to true to show typing message

    // Add typing indicator for bot
    // const typingIndicator: Message = { text: 'typing...', sender: 'bot' };
    // setMessages((prev) => [...prev, typingIndicator]);

    try {
      // Simple check to see if user is asking about courses
      const isCourseQuery = input.toLowerCase().includes("course");

      let response;

      if (isCourseQuery) {
        // If it's a course query, hit the ask_course endpoint
        console.log(isCourseQuery);
        response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/ask_course",
          {
            query: input,
          }
        );
        console.log(response);

        // Extract courses and summary from the response
        const summary = response.data.summary;
        const courses = response.data.courses;

        // Format bot's course reply
        const botMessages: Message[] = [
          { text: summary, sender: "bot" },
          ...courses.map((course: any) => ({
            text: `
              ${
                course.thumbnail
                  ? `<img src="${course.thumbnail}" alt="${course.name}" style="max-width: 100%; height: auto; margin-top: 0.5rem;" />`
                  : ""
              }<br/>
              <strong>${course.name}<br/>
              <strong>• Level:</strong> ${course.level}<br/>
              <strong>• Price:</strong> ₹${course.price}<br/>
            `,
            sender: "bot",
          })),
        ];

        // Remove typing and add bot response
        setMessages((prev) => [
          ...prev.filter((msg) => msg.text !== "typing..."),
          ...botMessages,
        ]);
      }

      // If it's not a course query, check if it's a roadmap query
      else if (input.toLowerCase().includes("roadmap")) {
        response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/get_roadmap",
          { query: input }
        );
        const title = response.data.roadmap_title;
        let roadmap = response.data.roadmap;

        // Format phase titles
        roadmap = roadmap
          .replace(/(Phase \d+.*?)\n/g, "<strong>$1</strong><br/>")
          .replace(/(Tools & Resources:)/g, "<strong>$1</strong>")
          .replace(/\n/g, "<br/>");

        const botMessages: Message[] = [
          { text: `<strong>${title}</strong>`, sender: "bot" },
          { text: roadmap, sender: "bot" },
        ];
        setMessages((prev) => [...prev, ...botMessages]);
      }

      // If it's not a course or roadmap query, check if it's a code query
      else {
        // Normal code-related request (for code queries)
        response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/process_query",
          {
            queryResult: {
              parameters: {
                code: input,
                programminglanguage: "",
              },
            },
          }
        );

        const botMessages: Message[] = response.data.fulfillmentMessages.map(
          (msg: any) => ({
            text: msg.text.text[0],
            sender: "bot",
          })
        );

        setMessages((prev) => [
          ...prev.filter((msg) => msg.text !== "typing..."),
          ...botMessages,
        ]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        {
          text: "Sorry, something went wrong. Please try again.",
          sender: "bot",
        },
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
      setTimeout(() => document.getElementById("chat-input")?.focus(), 300);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="chatbot">
      <div
        className="chat-button"
        ref={chatButtonRef}
        onClick={toggleChat}
        style={{
          visibility: isOpen ? "hidden" : "visible",
          opacity: isOpen ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        <img
          src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png"
          alt="Chatbot icon"
        />
      </div>
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <img
              src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png"
              alt="icon"
            />
            <span className="chat-title">NexGenie</span>
            <button className="close-button" onClick={toggleChat}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
          <div className="messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender}`}>
                {msg.sender === "bot" && (
                  <img
                    className="avatar bot-avatar"
                    src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png"
                    alt="Bot Avatar"
                  />
                )}
                {/* <div className={`bg-gray-200 chat-bubble ${msg.sender}`}>{msg.text}</div> */}

                <div
                  className={`bg-gray-200 chat-bubble ${msg.sender}`}
                  dangerouslySetInnerHTML={{ __html: msg.text }}
                />

                {msg.sender === "user" && (
                  <img
                    className="avatar user-avatar"
                    src="https://cdn.icon-icons.com/icons2/1378/PNG/512/avatardefault_92824.png"
                    alt="User Avatar"
                  />
                )}
              </div>
            ))}

            {/* Add typing indicator for bot */}
            {loading && (
              <div className="message bot">
                <img
                  className="avatar bot-avatar"
                  src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png"
                  alt="Bot Avatar"
                />
                <div className="chat-bubble bot">typing...</div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
          <div className="input-area">
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
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
