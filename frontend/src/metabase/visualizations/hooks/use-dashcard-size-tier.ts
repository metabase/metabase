import { type RefObject, useEffect, useState } from "react";

import {
  type DashcardSizeTier,
  getDashcardSizeTier,
} from "metabase/visualizations/lib/dashcard-sizing";

/**
 * Tracks the size tier of a dashboard card element. The tier must be derived
 * from the card box rather than the measured chart content, since the tier's
 * own padding shrinks the content box and would feed back into the selection.
 * Re-renders only when the resolved tier changes.
 */
export function useDashcardSizeTier(
  ref: RefObject<HTMLElement>,
): DashcardSizeTier {
  const [sizeTier, setSizeTier] = useState(() => getDashcardSizeTier(0, 0));

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSizeTier(getDashcardSizeTier(width, height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return sizeTier;
}
