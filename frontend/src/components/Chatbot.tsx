import React, { useState, useRef, useEffect, FC } from "react";
import axios from "axios";
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

// Set both in .env.local; REACT_APP_LEARNNEXUS_URL is where course pages live.
const API = process.env.REACT_APP_NEXGENIE_BACKEND;
const LEARNNEXUS = process.env.REACT_APP_LEARNNEXUS_URL;

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

// How many letters are wrong between two words. Two letters typed the wrong
// way round counts as one mistake, not two - "coures" for "course".
const editDistance = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[a.length][b.length];
};

// Does the text mention the keyword, spelt right or one typo off?
// Short keywords stay exact: "code" is one letter from "node" and "core",
// "print" one from "point", so a typo allowance there would misread them.
const fuzzyIncludes = (text: string, keyword: string): boolean => {
  const lower = text.toLowerCase();
  if (lower.includes(keyword)) return true;
  if (keyword.length < 6) return false;

  return lower
    .split(/[^a-z0-9+#]+/)
    .some(
      (word) =>
        Math.abs(word.length - keyword.length) <= 1 &&
        editDistance(word, keyword) <= 1
    );
};

const GREETINGS = /^(hi|hii|hlo|hello|hey|yo|good (morning|afternoon|evening))\b/i;

const CODE_WORDS = ["code", "program", "logic", "wap", "print", "display",
  "algorithm", "debug", "syntax", "function", "programming"];

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
  id?: string;
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

// The title query lets the course page show the name while the course loads,
// the same as LearnNexus' CourseCard does. LearnNexus is another site, so a new tab.
const courseHref = (course: Course) =>
  course.id
    ? `${LEARNNEXUS}/course/${encodeURIComponent(course.id)}?${new URLSearchParams({ title: course.name })}`
    : undefined;

const courseItem = (course: Course) => {
  const href = courseHref(course);
  return `
  <${href ? `a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"` : "div"} class="course-item group block mt-3.5 pt-3.5 border-t border-black/10">
    ${
      course.thumbnail
        ? `<img class="block max-w-full h-auto rounded-lg mb-2" src="${escapeHtml(
            course.thumbnail
          )}" alt="${escapeHtml(course.name)}" />`
        : ""
    }
    <strong class="group-hover:underline">${escapeHtml(course.name)}</strong><br/>
    <strong>• Level:</strong> ${escapeHtml(course.level)}<br/>
    <strong>• Price:</strong> ${escapeHtml(formatPrice(course.price))}
  </${href ? "a" : "div"}>`;
};

const TITLE = 'class="text-[15px] font-bold mb-1.5"';

/** Escapes the line first, so anything the model writes stays text, then
    turns **bold** and `code` into tags. */
const inline = (line: string) =>
  escapeHtml(line)
    .replace(
      /`([^`]+)`/g,
      '<code class="px-[5px] py-px rounded bg-black/[0.08] font-mono text-[0.9em]">$1</code>'
    )
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
      blocks.push(`<h4 ${TITLE}>${inline(heading[1])}</h4>`);
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

// The [&_x] variants style the HTML injected into the bubble. min-w-0: a flex
// item won't shrink below a wide code block, so it would push out of the window.
const bubbleClass = (sender: Message["sender"]) =>
  `max-w-[70%] min-w-0 px-[15px] py-2.5 rounded-2xl text-sm leading-[1.4] break-words text-left
   [&_p+p]:mt-2 [&_p+ul]:mt-2 [&_ul+p]:mt-2 [&_ul]:pl-[18px] [&_ul]:list-disc
   [&_ol]:pl-5 [&_ol]:list-decimal [&_li]:my-[3px] ${
     sender === "user"
       ? // sage-dark: white on plain sage is only 3:1, failing AA.
         "bg-sage-dark text-white rounded-tr-none"
       : "bg-gray-200 text-charcoal rounded-tl-none"
   }`;

// The robot's arms reach the image edges, so only the user avatar is round.
const avatarClass = (sender: Message["sender"]) =>
  `w-[30px] h-[30px] shrink-0 mx-2 object-contain ${sender === "user" ? "rounded-full" : ""}`;

const CodeBlock: FC<{ lang: string; source: string }> = ({ lang, source }) => {
  const [copied, setCopied] = useState(false);

  const copy = () =>
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  return (
    // The wrapper clips to its rounded corners and the scroll sits on the
    // <pre>, so a long line slides under a header that stays put.
    <div className="max-w-full my-2.5 rounded-lg overflow-hidden bg-gray-50">
      <div className="flex justify-between items-center gap-3 px-3 py-1.5 bg-gray-100 text-slate text-xs">
        <span className="tracking-[0.04em]">{lang}</span>
        <button
          onClick={copy}
          className="font-bold whitespace-nowrap opacity-75 hover:opacity-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={lang}
        style={docco}
        // docco sets these inline, so only customStyle can override them.
        customStyle={{
          backgroundColor: "transparent",
          padding: "0.75rem",
          borderRadius: "0.5rem",
          margin: 0,
        }}
        className="text-[13px] leading-normal whitespace-pre [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]"
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
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      htmlMessage(
        "<p>Hello User, NexGenie at your service! How can I assist you today?</p>"
      ),
    ]);
  }, []);

  const sendMessage = async () => {
    if (input.trim() === "" || loading) return;
    const userMessage: Message = {
      parts: [{ kind: "text", html: escapeHtml(input) }],
      sender: "user",
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Keywords first: free, instant, and right for most messages. Only when
      // none of them match does the backend get asked what the message means.
      let route = GREETINGS.test(input.trim())
        ? "greet"
        : fuzzyIncludes(input, "course")
        ? "course"
        : fuzzyIncludes(input, "roadmap")
        ? "roadmap"
        : CODE_WORDS.some((word) => fuzzyIncludes(input, word))
        ? "code"
        : "";

      if (!route) {
        // A failure here must not lose the message - without this branch it
        // would have gone to /ask_general anyway, so fall back to that.
        try {
          const guess = await axios.post(`${API}/intent`, { query: input });
          route = guess.data?.intent ?? "general";
        } catch {
          route = "general";
        }
      }

      if (route === "greet") {
        const response = await axios.post(
          `${API}/greet`,
          { query: input }
        );
        const replies: Message[] = response.data.fulfillmentMessages.map(
          (msg: FulfillmentMessage) => botMessage(msg.text?.text[0] || "")
        );
        setMessages((prev) => [...prev, ...replies]);
      } else if (route === "course") {
        const response = await axios.post(
          `${API}/ask_course`,
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
      } else if (route === "roadmap") {
        const response = await axios.post(
          `${API}/get_roadmap`,
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
          htmlMessage(`<h4 ${TITLE}>${escapeHtml(title)}</h4>${toHtml(roadmap)}`),
        ]);
      } else if (route === "code") {
        const response = await axios.post(
          `${API}/process_query`,
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
          `${API}/ask_general`,
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

  // Close on any click outside the window. Registered on the next tick so the
  // click that opened it doesn't close it.
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!windowRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    const id = setTimeout(() => document.addEventListener("click", onClick));
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

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
    <div
      className={`fixed bottom-5 right-5 z-[1000] font-sans ${
        // On phones, sit above any bottom nav on the host page while open.
        isOpen ? "max-[767.98px]:z-[100000]" : ""
      }`}
    >
      <button
        type="button"
        aria-label="Open NexGenie chat"
        className={`chat-button flex items-center justify-center w-[60px] h-[60px] max-[768px]:w-[50px] max-[768px]:h-[50px] max-[480px]:w-[45px] max-[480px]:h-[45px] rounded-full cursor-pointer transition-opacity duration-300 ${
          isOpen ? "invisible opacity-0" : ""
        }`}
        onClick={toggleChat}
      >
        <img
          src="/assets/nexgenie.png"
          alt="Chatbot icon"
          className="w-[54px] h-[54px] max-[768px]:w-[45px] max-[768px]:h-[45px] max-[480px]:w-10 max-[480px]:h-10"
        />
      </button>

      {isOpen && (
        <div
          ref={windowRef}
          className="fixed bottom-[30px] max-[767.98px]:bottom-2.5 right-[30px] w-80 max-[768px]:w-[min(90%,380px)] max-[480px]:w-[85%] h-[500px] rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden z-[1001] bg-white text-black"
        >
          <div className="flex items-center p-3 bg-sage text-white">
            <img src="/assets/nexgenie.png" alt="icon" className="w-10 h-10 mr-2.5" />
            <span className="flex flex-col flex-grow text-left text-base font-bold leading-[1.2]">
              NexGenie
              <small className="text-[11px] font-normal opacity-85">LearnNexus AI Assistant</small>
            </span>
          </div>

          {/* overflow-x-hidden: overflow-y alone makes x auto, so one wide code
              block would scroll the whole conversation sideways. */}
          <div
            className="flex-grow p-3 overflow-y-auto overflow-x-hidden bg-white [scrollbar-width:thin] [scrollbar-color:#e5e7eb_transparent]"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex items-start mb-2.5 ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "bot" && (
                  <img src="/assets/nexgenie.png" alt="Bot Avatar" className={avatarClass("bot")} />
                )}
                <div className={bubbleClass(msg.sender)}>
                  {msg.parts.map((part, i) =>
                    part.kind === "code" ? (
                      <CodeBlock key={i} lang={part.lang} source={part.source} />
                    ) : (
                      <div
                        key={i}
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(part.html, {
                            ADD_ATTR: ["target"],
                          }),
                        }}
                      />
                    )
                  )}
                </div>
                {msg.sender === "user" && (
                  <img src="/assets/user_avatar.png" alt="User Avatar" className={avatarClass("user")} />
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-start mb-2.5 justify-start">
                <img src="/assets/nexgenie.png" alt="Bot Avatar" className={avatarClass("bot")} />
                <div className={bubbleClass("bot")}>typing...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-center p-2.5 border-t border-gray-200 bg-white">
            <input
              id="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-grow p-2.5 text-sm max-[768px]:text-xs border border-sage focus:border-sage-dark rounded-full outline-none bg-white text-black"
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-sage hover:bg-sage-hover disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-full px-[15px] py-2.5 max-[768px]:px-3 max-[768px]:py-2 max-[768px]:text-xs ml-2 transition-colors duration-300"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chatbot;
