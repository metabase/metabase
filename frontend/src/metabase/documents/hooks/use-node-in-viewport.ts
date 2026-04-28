import { useIntersection } from "@mantine/hooks";
import { useMemo } from "react";

import { usePrintContext } from "metabase/documents/contexts/PrintContext";
import { useScrollContainer } from "metabase/documents/contexts/ScrollContainerContext";

/**
 * Detects whether a node view element is near the viewport.
 * Uses IntersectionObserver with a 50% rootMargin buffer on all sides.
 *
 * entry === null (initial state before first observation) is treated as
 * out-of-viewport so callers can defer expensive work (e.g. card queries)
 * until IntersectionObserver confirms visibility. Visible nodes briefly
 * show a placeholder for ~1 frame before IO fires its first callback,
 * which is preferable to firing N redundant queries on mount.
 *
 * While printing we force in-viewport so off-screen cards are rendered
 * into the print output instead of staying as skeletons.
 */
export function useNodeInViewport() {
  const scrollContainer = useScrollContainer();
  const { isPrinting } = usePrintContext();

  const options = useMemo(
    () => ({
      root: scrollContainer,
      rootMargin: "50%",
      threshold: 0,
    }),
    [scrollContainer],
  );

  const { ref, entry } = useIntersection(options);

  const isInViewport = isPrinting || (entry?.isIntersecting ?? false);

  return { ref, isInViewport };
}
