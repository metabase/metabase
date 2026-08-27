import type React from "react";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { Box } from "metabase/ui";

import S from "./EntityPicker.module.css";

const scrollToLastColumn = (
  container: HTMLDivElement | null,
  behavior: "smooth" | "auto",
) => {
  const lastColumn = container?.firstElementChild?.lastElementChild;

  if (container && lastColumn instanceof HTMLElement) {
    container.scrollTo({ left: lastColumn.offsetLeft, behavior });
  }
};

export const AutoScrollBox = ({
  children,
  contentHash,
  ...props
}: {
  children: React.ReactNode;
  contentHash: string;
  props?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousContainerRef = usePrevious(containerRef.current);
  const previousContentHash = usePrevious(contentHash);

  useEffect(() => {
    if (!containerRef?.current || !contentHash) {
      return;
    }

    if (contentHash !== previousContentHash) {
      scrollToLastColumn(
        containerRef.current,
        !previousContainerRef ? "auto" : "smooth",
      );
    }
  }, [previousContentHash, contentHash, previousContainerRef]);

  return (
    <Box
      h="100%"
      className={S.HorizontalScrollBox}
      {...props}
      ref={containerRef}
    >
      {children}
    </Box>
  );
};
