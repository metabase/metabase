import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router";

import {
  createScrollPositionStore,
  getHistoryEntryKey,
  resetPageScrollPositions,
  restoreScrollPositions,
  trackScrollPositions,
} from "./scroll-restoration";

/**
 * Gives in-app navigation the scroll behavior of page loads. A navigation to a
 * new path starts each page scroller marked with `RESET_SCROLL_ON_NAVIGATE` at
 * the top. Back and forward put every element the user scrolled on that
 * history entry back where it was, waiting for content that loads after the
 * page renders. A navigation that keeps the path stays on the same page, so it
 * changes neither.
 *
 * Browsers restore only the window's scroll position, and Metabase pages scroll
 * inside elements instead, so without this nothing is restored.
 */
export function useScrollRestoration(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const [store] = useState(createScrollPositionStore);
  const entryKey = getHistoryEntryKey(location);
  const entryKeyRef = useRef(entryKey);
  const pathnameRef = useRef(location.pathname);
  const stopRestoringRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const stopTracking = trackScrollPositions(store, () => entryKeyRef.current);
    window.addEventListener("pagehide", store.persist);
    return () => {
      stopTracking();
      stopRestoringRef.current?.();
      window.removeEventListener("pagehide", store.persist);
      store.persist();
    };
  }, [store]);

  useLayoutEffect(() => {
    const previousEntryKey = entryKeyRef.current;
    entryKeyRef.current = entryKey;
    const isNewPath = pathnameRef.current !== location.pathname;
    pathnameRef.current = location.pathname;
    const isTraversal = navigationType === NavigationType.Pop;

    // Pages change the search as they load, such as a dashboard replacing it
    // with its filter values, which must not cut short the restore of the entry.
    if (!isNewPath && !isTraversal) {
      // A replace gives the entry a new key, so its offsets move with it.
      if (navigationType === NavigationType.Replace) {
        store.rekey(previousEntryKey, entryKey);
      }
      return;
    }

    stopRestoringRef.current?.();
    stopRestoringRef.current = null;

    // Copy the saved offsets before anything scrolls. The reset below, and the
    // browser lowering an offset to fit a page that is still loading, record
    // new offsets for this entry.
    const savedPositions = isTraversal ? store.get(entryKey) : undefined;
    const positionsToRestore = savedPositions && new Map(savedPositions);

    if (isNewPath) {
      resetPageScrollPositions();
    }
    if (positionsToRestore) {
      stopRestoringRef.current = restoreScrollPositions(positionsToRestore);
    }
  }, [entryKey, location.pathname, navigationType, store]);
}
