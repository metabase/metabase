import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import reactAnsiStyle from "react-ansi-style";
import { t } from "ttag";

import { AnsiLogs } from "metabase/common/components/AnsiLogs";

import S from "./LogOutput.modules.css";

type LogOutputProps = {
  content?: string;
};

export function LogOutput({ content }: LogOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const displayContent = useMemo(() => {
    if (!content || content.trim().length === 0) {
      return t`No output`;
    }

    return reactAnsiStyle(React, content);
  }, [content]);

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
    <AnsiLogs
      ref={containerRef}
      className={S.logOutput}
      onScroll={handleScroll}
      mah="12rem"
      p="sm"
      bg="background-secondary"
      fz="xs"
      data-css-specificity-hack=""
      data-testid="log-output"
    >
      {displayContent}
    </AnsiLogs>
  );
}
