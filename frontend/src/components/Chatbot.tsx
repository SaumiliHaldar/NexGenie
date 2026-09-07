import React, { useState, useRef, useEffect, FC } from "react";
import axios from "axios";
import "./Chatbot.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import DOMPurify from "dompurify";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { docco } from "react-syntax-highlighter/dist/esm/styles/hljs";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import c from "react-syntax-highlighter/dist/esm/languages/hljs/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/hljs/cpp";
import csharp from "react-syntax-highlighter/dist/esm/languages/hljs/csharp";
import css from "react-syntax-highlighter/dist/esm/languages/hljs/css";
import diff from "react-syntax-highlighter/dist/esm/languages/hljs/diff";
import dockerfile from "react-syntax-highlighter/dist/esm/languages/hljs/dockerfile";
import go from "react-syntax-highlighter/dist/esm/languages/hljs/go";
import java from "react-syntax-highlighter/dist/esm/languages/hljs/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import kotlin from "react-syntax-highlighter/dist/esm/languages/hljs/kotlin";
import markdown from "react-syntax-highlighter/dist/esm/languages/hljs/markdown";
import php from "react-syntax-highlighter/dist/esm/languages/hljs/php";
import plaintext from "react-syntax-highlighter/dist/esm/languages/hljs/plaintext";
import powershell from "react-syntax-highlighter/dist/esm/languages/hljs/powershell";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import r from "react-syntax-highlighter/dist/esm/languages/hljs/r";
import ruby from "react-syntax-highlighter/dist/esm/languages/hljs/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/hljs/rust";
import shell from "react-syntax-highlighter/dist/esm/languages/hljs/shell";
import sql from "react-syntax-highlighter/dist/esm/languages/hljs/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/hljs/swift";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import xml from "react-syntax-highlighter/dist/esm/languages/hljs/xml";
import yaml from "react-syntax-highlighter/dist/esm/languages/hljs/yaml";

// The default entry bundles ~190 languages. Registering only what a learner on
// this portal is likely to ask for keeps the download far smaller. plaintext is
// the fallback for an unlabelled block, so it has to be here too.
const LANGUAGES: Record<string, any> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  plaintext,
  powershell,
  python,
  r,
  ruby,
  rust,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};
Object.entries(LANGUAGES).forEach(([name, syntax]) =>
  SyntaxHighlighter.registerLanguage(name, syntax)
);

// What the model writes after ``` versus what highlight.js calls it.
const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  node: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  "c++": "cpp",
  cc: "cpp",
  "c#": "csharp",
  cs: "csharp",
  kt: "kotlin",
  rb: "ruby",
  golang: "go",
  sh: "bash",
  zsh: "bash",
  git: "bash",
  console: "shell",
  terminal: "shell",
  ps1: "powershell",
  pwsh: "powershell",
  docker: "dockerfile",
  html: "xml",
  svg: "xml",
  yml: "yaml",
  md: "markdown",
  postgres: "sql",
  mysql: "sql",
  text: "plaintext",
  txt: "plaintext",
  none: "plaintext",
};

const resolveLanguage = (raw: string) => {
  const name = (raw || "").toLowerCase();
  const resolved = LANGUAGE_ALIASES[name] ?? name;
  return resolved in LANGUAGES ? resolved : "plaintext";
};

/** A message is a list of parts so text and code can sit in one bubble. */
type Part =
  | { kind: "text"; html: string }
  | { kind: "code"; lang: string; source: string };

interface Message {
  parts: Part[];
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
  // The backend formats this, so it arrives as "Free" or a number as text.
  price: string;
  thumbnail?: string;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c] as string)
  );

const formatPrice = (price: string) => {
  const value = String(price).trim();
  return value === "0" || value.toLowerCase() === "free" ? "Free" : `₹${value}`;
};

const courseItem = (course: Course) => `
  <div class="course-item">
    ${
      course.thumbnail
        ? `<img class="course-thumb" src="${escapeHtml(
            course.thumbnail
          )}" alt="${escapeHtml(course.name)}" />`
        : ""
    }
    <strong>${escapeHtml(course.name)}</strong><br/>
    <strong>• Level:</strong> ${escapeHtml(course.level)}<br/>
    <strong>• Price:</strong> ${escapeHtml(formatPrice(course.price))}
  </div>`;

/** Escapes the line first, so anything the model writes stays text, then
    turns **bold** and `code` into tags. */
const inline = (line: string) =>
  escapeHtml(line)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/**
 * Turns a reply into HTML: headings, bullet and numbered lists, paragraphs.
 * Lists become real <ul>/<ol> so a wrapped line indents under the text rather
 * than under the marker, and markdown the model emits is rendered instead of
 * being shown as raw #, * and ` characters.
 */
const toHtml = (text: string) => {
  const blocks: string[] = [];
  let items: string[] = [];
  let ordered = false;

  const flush = () => {
    if (items.length) {
      const tag = ordered ? "ol" : "ul";
      blocks.push(`<${tag}>${items.map((i) => `<li>${i}</li>`).join("")}</${tag}>`);
      items = [];
    }
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[•*-]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);

    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push(`<h4 class="msg-title">${inline(heading[1])}</h4>`);
    } else if (bullet) {
      if (ordered) flush();
      ordered = false;
      items.push(inline(bullet[1]));
    } else if (numbered) {
      if (!ordered) flush();
      ordered = true;
      items.push(inline(numbered[1]));
    } else {
      flush();
      blocks.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return blocks.join("");
};

/**
 * Splits a reply into text and fenced code blocks. The old code only checked
 * whether the whole reply started with ```, so a code block with any text
 * around it, or a second block, was shown as raw backticks.
 * An unterminated fence is treated as code to the end - the model sometimes
 * stops mid-block.
 */
const parseParts = (raw: string): Part[] => {
  const fence = /```([\w+#-]*)[ \t]*\r?\n([\s\S]*?)(?:```|$)/g;
  const parts: Part[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(raw)) !== null) {
    const before = raw.slice(cursor, match.index);
    if (before.trim()) parts.push({ kind: "text", html: toHtml(before) });
    parts.push({
      kind: "code",
      lang: resolveLanguage(match[1]),
      source: match[2].replace(/\s+$/, ""),
    });
    cursor = match.index + match[0].length;
  }

  const rest = raw.slice(cursor);
  if (rest.trim()) parts.push({ kind: "text", html: toHtml(rest) });
  return parts;
};

const botMessage = (raw: string): Message => ({
  parts: parseParts(raw),
  sender: "bot",
});

const htmlMessage = (html: string): Message => ({
  parts: [{ kind: "text", html }],
  sender: "bot",
});

const CodeBlock: FC<{ lang: string; source: string }> = ({ lang, source }) => {
  const [copied, setCopied] = useState(false);

  const copy = () =>
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  return (
    <div className="code-block-wrapper">
      <div className="code-header">
        <span className="language-label">{lang}</span>
        <button className="copy-btn" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={docco}
        customStyle={{
          backgroundColor: "transparent",
          padding: "0.75rem",
          borderRadius: "0.5rem",
          margin: 0,
        }}
        wrapLongLines={false}
      >
        {source}
      </SyntaxHighlighter>
    </div>
  );
};

const Chatbot: FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      htmlMessage(
        "<p>Hello User, NexGenie at your service! How can I assist you today?</p>"
      ),
    ]);
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

  const sendMessage = async () => {
    if (input.trim() === "") return;
    const userMessage: Message = {
      parts: [{ kind: "text", html: escapeHtml(input) }],
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const isCourseQuery = input.toLowerCase().includes("course");

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
        const response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/greet",
          { query: input }
        );
        const replies: Message[] = response.data.fulfillmentMessages.map(
          (msg: FulfillmentMessage) => botMessage(msg.text?.text[0] || "")
        );
        setMessages((prev) => [...prev, ...replies]);
      } else if (isCourseQuery) {
        const response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/ask_course",
          { query: input }
        );
        const summary: string = response.data.summary;
        const courses: Course[] = response.data.courses ?? [];
        setMessages((prev) => [
          ...prev,
          // Through toHtml so any markdown the model slips in is rendered
          // rather than shown as raw ** and --- characters.
          htmlMessage(`${toHtml(summary)}${courses.map(courseItem).join("")}`),
        ]);
      } else if (input.toLowerCase().includes("roadmap")) {
        const response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/get_roadmap",
          { query: input }
        );
        const title = response.data.roadmap_title;
        // toHtml escapes its input, so mark these up the way it expects
        // rather than injecting tags here.
        const roadmap = response.data.roadmap
          .replace(/(Phase \d+.*?)\n/g, "**$1**\n")
          .replace(/(Tools & Resources:)/g, "**$1**");
        setMessages((prev) => [
          ...prev,
          htmlMessage(`<h4 class="msg-title">${title}</h4>${toHtml(roadmap)}`),
        ]);
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
        const response = await axios.post(
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

        const replies: Message[] = response.data.fulfillmentMessages.map(
          (msg: FulfillmentMessage) => botMessage(msg.text?.text[0] || "")
        );
        setMessages((prev) => [...prev, ...replies]);
      } else {
        const response = await axios.post(
          "https://saumilihaldar-nexgenie.hf.space/ask_general",
          { query: input }
        );
        setMessages((prev) => [
          ...prev,
          botMessage(
            response.data?.answer ??
              "Sorry, I couldn't put together an answer for that."
          ),
        ]);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const isRateLimited =
        axios.isAxiosError(error) && error.response?.status === 429;
      setMessages((prev) => [
        ...prev,
        htmlMessage(
          isRateLimited
            ? "<p>You're sending messages a bit too quickly. Please wait a minute and try again.</p>"
            : "<p>Sorry, something went wrong. Please try again.</p>"
        ),
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
        <img
          src="/assets/nexgenie.png"
          alt="Chatbot icon"
          width={50}
          height={50}
        />
      </div>

      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <img src="/assets/nexgenie.png" alt="icon" width={30} height={30} />
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
                    src="/assets/nexgenie.png"
                    alt="Bot Avatar"
                    width={30}
                    height={30}
                  />
                )}
                <div className={`chat-bubble ${msg.sender}`}>
                  {msg.parts.map((part, i) =>
                    part.kind === "code" ? (
                      <CodeBlock key={i} lang={part.lang} source={part.source} />
                    ) : (
                      <div
                        key={i}
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(part.html),
                        }}
                      />
                    )
                  )}
                </div>
                {msg.sender === "user" && (
                  <img
                    className="avatar user-avatar"
                    src="/assets/user_avatar.png"
                    alt="User Avatar"
                    width={30}
                    height={30}
                  />
                )}
              </div>
            ))}
            {loading && (
              <div className="message bot">
                <img
                  className="avatar bot-avatar"
                  src="/assets/nexgenie.png"
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
