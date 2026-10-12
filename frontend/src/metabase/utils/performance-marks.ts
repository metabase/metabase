import { useEffect } from "react";

/**
 * The moments in a page load that only the app knows.
 *
 * Navigation timing already reports everything up to `loadEventEnd`, and the
 * paint entries report when the browser first drew something. What neither can
 * say is when the page the user asked for actually has its data. These marks
 * fill that gap, and a benchmark reads them back with
 * `performance.getEntriesByName`.
 *
 * Marks are cheap and carry no payload, so they are recorded in every build
 * rather than behind a flag.
 */
export const PERFORMANCE_MARKS = {
  /**
   * React has committed the app shell. The entry bundle has downloaded, parsed
   * and run by this point, but no route content is on screen yet.
   */
  appMounted: "mb:app-mounted",

  /**
   * Everything the route needs has arrived, so no loading state is left on
   * screen. Routes opt in, because only the route knows when it is done.
   */
  pageReady: "mb:page-ready",
} as const;

export type PerformanceMark =
  (typeof PERFORMANCE_MARKS)[keyof typeof PERFORMANCE_MARKS];

const recorded = new Set<PerformanceMark>();

/**
 * Records a mark the first time it is asked for and ignores every later call.
 *
 * A component that remounts, a dashboard that auto-refreshes, or a second
 * navigation would otherwise move a reading that is meant to describe the
 * first load.
 */
export function markOnce(name: PerformanceMark): void {
  // static-viz renders in GraalJS, which has no Performance API.
  if (typeof performance === "undefined" || !performance.mark) {
    return;
  }
  if (recorded.has(name)) {
    return;
  }
  recorded.add(name);
  performance.mark(name);
}

/** Test seam: forgets which marks have been recorded. */
export function resetPerformanceMarks(): void {
  recorded.clear();
}

/**
 * Records `page-ready` the first time a route reports that its content has
 * arrived. Routes opt in, because only the route knows what "arrived" means for
 * it.
 */
export function useMarkPageReady(isReady: boolean): void {
  useEffect(() => {
    if (isReady) {
      markOnce(PERFORMANCE_MARKS.pageReady);
    }
  }, [isReady]);
}
