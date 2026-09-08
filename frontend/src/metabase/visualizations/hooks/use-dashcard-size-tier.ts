import { type RefObject, useLayoutEffect, useState } from "react";

import {
  type DashcardSizeTier,
  getDashcardSizeTier,
} from "metabase/visualizations/lib/dashcard-sizing";

/**
 * Tracks the size tier of a dashboard card element. The tier must be derived
 * from the card box rather than the measured chart content, since the tier's
 * own padding shrinks the content box and would feed back into the selection.
 * The first measurement happens synchronously before paint, so charts do not
 * render once with the fallback tier and immediately re-render with the real
 * one. Re-renders only when the resolved tier changes.
 */
export function useDashcardSizeTier(
  ref: RefObject<HTMLElement>,
): DashcardSizeTier {
  const [sizeTier, setSizeTier] = useState(() => getDashcardSizeTier(0, 0));

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    // clientWidth/clientHeight match the observer's content box, so the
    // pre-paint measurement and later observations resolve the same tier.
    setSizeTier(getDashcardSizeTier(element.clientWidth, element.clientHeight));

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSizeTier(getDashcardSizeTier(width, height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return sizeTier;
}
