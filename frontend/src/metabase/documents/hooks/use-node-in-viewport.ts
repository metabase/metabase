import { useIntersection } from "@mantine/hooks";
import { useMemo } from "react";

import { useScrollContainer } from "metabase/documents/contexts/ScrollContainerContext";

/**
 * Detects whether a node view element is near the viewport.
 * Uses IntersectionObserver with a 50% rootMargin buffer on all sides.
 *
 * entry === null (initial state before first observation) is treated as
 * in-viewport to avoid a placeholder flash on mount.
 */
export function useNodeInViewport() {
  const scrollContainer = useScrollContainer();

  const options = useMemo(
    () => ({
      root: scrollContainer,
      rootMargin: "50%",
      threshold: 0,
    }),
    [scrollContainer],
  );

  const { ref, entry } = useIntersection(options);

  // null entry means not yet observed — treat as in-viewport to avoid flash
  const isInViewport = entry === null || entry.isIntersecting;

  return { ref, isInViewport };
}
