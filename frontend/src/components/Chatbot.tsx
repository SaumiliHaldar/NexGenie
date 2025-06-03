import React, { useState, useRef, useEffect, FC } from "react";
import axios from "axios";
import "./Chatbot.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import DOMPurify from "dompurify";
import SyntaxHighlighter from "react-syntax-highlighter";
import { docco } from "react-syntax-highlighter/dist/esm/styles/hljs"; // Importing the theme
import ReactDOMServer from "react-dom/server";

interface Message {
  text: string;
  sender: "bot" | "user";
}

interface FulfillmentMessage {
  text?: {
    text: string[];
  };
}

interface Course {
  name: string;
  level: string;
  price: number;
  thumbnail?: string;
}

const Chatbot: FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const introMessage: Message = {
      text: "Hello User, NexGenie at your service! How can I assist you today?",
      sender: "bot",
    };
    setMessages([introMessage]);
  }, []);

  useEffect(() => {
    if (chatButtonRef.current) {
      if (isOpen) {
        chatButtonRef.current.style.animation = "none";
      } else {
        chatButtonRef.current.style.animation =
          "moveUpDown 1.5s ease-in-out infinite";
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const handleCopyClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains("copy-btn")) {
        const codeToCopy = target.getAttribute("data-clipboard-text");
        if (codeToCopy) {
          navigator.clipboard.writeText(codeToCopy).then(() => {
            const originalText = target.textContent;
            target.textContent = "Copied";
            setTimeout(() => {
              if (target) target.textContent = originalText || "Copy";
            }, 2000);
          });
        }
      }
    };
    document.addEventListener("click", handleCopyClick);
    return () => document.removeEventListener("click", handleCopyClick);
  }, []);

  const sendMessage = async () => {
    if (input.trim() === "") return;
    const userMessage: Message = { text: input, sender: "user" };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const isCourseQuery = input.toLowerCase().includes("course");
      let response;

      const greetingKeywords = [
        "hi",
        "hii",
        "hlo",
        "hello",
        "hey",
        "yo",
        "good morning",
        "good afternoon",
        "good evening",
      ];
      const isGreeting = greetingKeywords.some((greet) =>
        input
          .toLowerCase()
          .trim()
          .match(new RegExp(`^${greet}\\b`, "i"))
      );

      if (isGreeting) {
        response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/greet",
          { query: input }
        );
        const botMessages: Message[] = response.data.fulfillmentMessages.map(
          (msg: FulfillmentMessage) => ({
            text: msg.text?.text[0] || "",
            sender: "bot",
          })
        );
        setMessages((prev) => [...prev, ...botMessages]);
      } else if (isCourseQuery) {
        response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/ask_course",
          { query: input }
        );
        const summary = response.data.summary;
        const courses = response.data.courses;
        const botMessages: Message[] = [
          { text: summary, sender: "bot" },
          ...courses.map((course: Course) => ({
            text: `
              ${
                course.thumbnail
                  ? `<img src="${course.thumbnail}" alt="${course.name}" style="max-width: 100%; height: auto; margin-top: 0.5rem;" />`
                  : ""
              }
              <br/>
              <strong>${course.name}</strong><br/>
              <strong>• Level:</strong> ${course.level}<br/>
              <strong>• Price:</strong> ₹${course.price}<br/>
            `,
            sender: "bot",
          })),
        ];
        setMessages((prev) => [
          ...prev.filter((msg) => msg.text !== "typing..."),
          ...botMessages,
        ]);
      } else if (input.toLowerCase().includes("roadmap")) {
        response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/get_roadmap",
          { query: input }
        );
        const title = response.data.roadmap_title;
        let roadmap = response.data.roadmap;
        roadmap = roadmap
          .replace(/(Phase \d+.*?)\n/g, "<strong>$1</strong><br/>")
          .replace(/(Tools & Resources:)/g, "<strong>$1</strong>")
          .replace(/\n/g, "<br/>");
        const botMessages: Message[] = [
          { text: `<strong>${title}</strong>`, sender: "bot" },
          { text: roadmap, sender: "bot" },
        ];
        setMessages((prev) => [...prev, ...botMessages]);
      } else if (
        [
          "code",
          "program",
          "logic",
          "wap",
          "print",
          "display",
          "algorithm",
          "debug",
          "syntax",
          "function",
          "programming",
        ].some((keyword) => input.toLowerCase().includes(keyword))
      ) {
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
          (msg: FulfillmentMessage) => {
            const codeText = msg.text?.text[0];
            if (codeText && codeText.startsWith("```")) {
              const languageMatch = codeText.match(/^```(\w+)\n/);
              const language = languageMatch ? languageMatch[1] : "plaintext";
              const codeString = codeText
                .replace(/^```(\w+)\n?/, "")
                .replace(/```$/, "");

              // the code block as a standalone component
              const CodeBlock = () => (
                <div className="code-block-wrapper">
                  <div className="code-header">
                    <span className="language-label">
                      {language.toLowerCase()}
                    </span>
                    <button
                      className="copy-btn"
                      data-clipboard-text={codeString.replace(/"/g, "&quot;")}
                    >
                      Copy
                    </button>
                  </div>
                  <SyntaxHighlighter
                    language={language}
                    style={docco} // You can use atomOneDark or any other syntax theme
                    customStyle={{
                      backgroundColor: "transparent",
                      padding: "0.75rem",
                      borderRadius: "0.5rem",
                      margin: 0,
                    }}
                    wrapLongLines={false} // Disable auto-wrap to enable horizontal scrolling
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              );

              return {
                // Render the JSX directly without additional wrapping
                text: ReactDOMServer.renderToString(<CodeBlock />),
                sender: "bot",
              };
            }
            return {
              text: msg.text?.text[0] || "",
              sender: "bot",
            };
          }
        );

        setMessages((prev) => [...prev, ...botMessages]);
      } else {
        response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/ask_general",
          { query: input }
        );
        if (response.data && response.data.answer) {
          const formattedAnswer = response.data.answer
            .replace(/\n/g, "<br/>")
            .replace(/(\d+\.\s*[A-Z][^\n<]*)/g, "<strong>$1</strong>");
          const botMessages: Message[] = [
            { text: formattedAnswer, sender: "bot" },
          ];
          setMessages((prev) => [
            ...prev.filter((msg) => msg.text !== "typing..."),
            ...botMessages,
          ]);
        }
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
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
        <img src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png" alt="Chatbot icon" width={50} height={50} />
      </div>

      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <img src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png" alt="icon" width={30} height={30} />
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
                    width={30}
                    height={30}
                  />
                )}
                <div
                  className={`chat-bubble ${msg.sender}`}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(msg.text),
                  }}
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
            {loading && (
              <div className="message bot">
                <img
                  className="avatar bot-avatar"
                  src="https://png.pngtree.com/png-vector/20220611/ourmid/pngtree-smiling-cute-robot-chat-bot-in-speech-bubble-png-image_5008700.png"
                  alt="Bot Avatar"
                  width={30}
                  height={30}
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
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
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