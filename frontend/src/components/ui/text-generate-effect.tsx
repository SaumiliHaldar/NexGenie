import React, { useEffect, useState } from "react";

export const TextGenerateEffect = ({
  words,
  className,
  style,
}: {
  words: string;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const [scope, setScope] = useState(0);
  const wordsArray = words.split(" ");

  useEffect(() => {
    if (scope < wordsArray.length) {
      const timeout = setTimeout(() => {
        setScope(scope + 1);
      }, 200);
      return () => clearTimeout(timeout);
    }
  }, [scope, wordsArray.length]);

  return (
    <div className={className} style={style}>
      {wordsArray.map((word, idx) => {
        return (
          <span
            key={idx}
            style={{
              opacity: idx < scope ? 1 : 0,
              display: "inline-block",
              marginRight: "0.25em",
              transition: "opacity 0.5s ease-in-out, filter 0.5s ease-in-out",
              filter: idx < scope ? "blur(0px)" : "blur(10px)",
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
