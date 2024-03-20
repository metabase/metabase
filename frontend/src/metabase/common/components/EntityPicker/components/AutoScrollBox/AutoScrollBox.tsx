import type React from "react";
import { useRef, useEffect } from "react";
import { usePrevious } from "react-use";

import { HorizontalScrollBox } from "./AutoScrollBox.styled";

const scrollRight = (
  container: HTMLDivElement | null,
  behavior: "smooth" | "auto",
) => {
  if (!container) {
    return;
  }
  const diff = container.scrollWidth - container.clientWidth;
  container.scrollBy({ left: diff, behavior });
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
      scrollRight(
        containerRef.current,
        !previousContainerRef ? "auto" : "smooth",
      );
    }
  }, [previousContentHash, contentHash, previousContainerRef]);

  return (
    <HorizontalScrollBox h="100%" {...props} ref={containerRef}>
      {children}
    </HorizontalScrollBox>
  );
};
