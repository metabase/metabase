import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import reactAnsiStyle from "react-ansi-style";

import { LogOutputContainer } from "./LogOutput.styled";

interface LogOutputProps {
  content?: string;
  showLineNumbers?: boolean;
  maxLines?: number;
}

export function LogOutput({
  content,
  showLineNumbers = true,
  maxLines = 20,
}: LogOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const { displayContent, actualLines } = useMemo(() => {
    if (!content || content.trim().length === 0) {
      return { displayContent: "No output", actualLines: 1 };
    }

    const lines = content.split("\n");
    let processedContent = content;

    if (showLineNumbers) {
      const maxLineLength = lines.length.toString().length;
      processedContent = lines
        .map(
          (line, index) =>
            `${(index + 1).toString().padStart(maxLineLength, " ")} | ${line}`,
        )
        .join("\n");
    }

    return {
      displayContent: reactAnsiStyle(React, processedContent),
      actualLines: lines.length,
    };
  }, [content, showLineNumbers]);

  // Calculate the height based on actual lines (up to maxLines)
  const linesToShow = Math.min(actualLines, maxLines);
  const containerHeight = `${linesToShow * 1.4 + 2}em`; // 1.4 is line-height + padding
  const maxContainerHeight = `${maxLines * 1.4 + 2}em`;

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (containerRef.current && shouldAutoScroll && !isUserScrolled) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayContent, shouldAutoScroll, isUserScrolled]);

  // Handle scroll events to detect user scrolling
  const handleScroll = () => {
    if (!containerRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 5;

    if (isAtBottom) {
      setIsUserScrolled(false);
      setShouldAutoScroll(true);
    } else {
      setIsUserScrolled(true);
      setShouldAutoScroll(false);
    }
  };

  return (
    <LogOutputContainer
      ref={containerRef}
      style={{ height: containerHeight, maxHeight: maxContainerHeight }}
      onScroll={handleScroll}
    >
      {displayContent}
    </LogOutputContainer>
  );
}
