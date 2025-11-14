import { useEffect, useRef, useState } from "react";
import * as _ from "underscore";

type TitleEntry = {
  id: string;
  title: string;
  titleIndex: number;
};

const titleStack: TitleEntry[] = [];
const SEPARATOR = " · ";

const updateDocumentTitle = _.debounce(() => {
  document.title = titleStack
    .sort((a, b) => a.titleIndex - b.titleIndex)
    .map((entry) => entry.title)
    .filter((title) => title)
    .reverse()
    .join(SEPARATOR);
}, 100);

let nextId = 0;

/**
 * Hook to set the page title with support for hierarchical stacking.
 *
 * Multiple components can set titles simultaneously, and they will be combined
 * with " · " separator. Lower titleIndex values appear first after reversal.
 *
 * @param title - The title string or function that returns a title
 * @param options - Configuration options
 * @param options.titleIndex - Priority for stacking (default: 0). Controls order in the final title.
 * @param options.refresh - Promise that triggers title re-evaluation when resolved
 *
 * @example
 * // Simple static title
 * usePageTitle("Search");
 * // Result: "Search"
 *
 * @example
 * // Hierarchical stacking
 * // Component A:
 * usePageTitle("Metabase", { titleIndex: 0 });
 * // Component B:
 * usePageTitle("Admin", { titleIndex: 0 });
 * // Component C:
 * usePageTitle("Databases", { titleIndex: 1 });
 * // Result: "Databases · Admin · Metabase"
 *
 * @example
 * // Dynamic title
 * usePageTitle(dashboard?.name || "Loading...", { titleIndex: 1 });
 *
 * @example
 * // With async refresh
 * const loadPromise = loadData();
 * usePageTitle(() => data?.title || "Loading", { refresh: loadPromise });
 */
export function usePageTitle(
  title: string | (() => string),
  options?: {
    titleIndex?: number;
    refresh?: Promise<any>;
  },
) {
  const idRef = useRef<string>(`title-${nextId++}`);
  const titleIndex = options?.titleIndex ?? 0;

  useEffect(() => {
    const id = idRef.current;
    const resolvedTitle = typeof title === "function" ? title() : title;

    // Add to stack
    titleStack.push({ id, title: resolvedTitle, titleIndex });
    updateDocumentTitle();

    // Handle async refresh if provided
    if (options?.refresh) {
      options.refresh.then(() => {
        const entry = titleStack.find((e) => e.id === id);
        if (entry) {
          entry.title = typeof title === "function" ? title() : title;
          updateDocumentTitle();
        }
      });
    }

    // Cleanup on unmount
    return () => {
      const index = titleStack.findIndex((e) => e.id === id);
      if (index !== -1) {
        titleStack.splice(index, 1);
        updateDocumentTitle();
      }
    };
  }, [title, titleIndex, options?.refresh]);
}

const SECONDS_UNTIL_DISPLAY = 10;

/**
 * Hook to set page title with optional loading time display.
 *
 * When a loading operation is running for more than 10 seconds, displays the elapsed
 * time in MM:SS format in the page title. Updates every 100ms.
 *
 * @param title - The base title string
 * @param options - Configuration options
 * @param options.titleIndex - Priority for stacking (default: 0)
 * @param options.startTime - Performance timestamp when loading started (from performance.now())
 * @param options.isRunning - Whether the loading operation is currently running
 *
 * @example
 * // In a dashboard component
 * const { loadingStartTime, isRunning } = useDashboardContext();
 * usePageTitleWithLoadingTime("My Dashboard", {
 *   titleIndex: 1,
 *   startTime: loadingStartTime,
 *   isRunning
 * });
 */
export function usePageTitleWithLoadingTime(
  title: string,
  options?: {
    titleIndex?: number;
    startTime?: number | null;
    isRunning?: boolean;
  },
) {
  const [, setRefreshTrigger] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate loading time to display
  const getLoadingTimeTitle = () => {
    const { startTime, isRunning } = options || {};

    if (startTime == null || !isRunning) {
      return "";
    }

    const totalSeconds = (performance.now() - startTime) / 1000;

    if (totalSeconds < SECONDS_UNTIL_DISPLAY) {
      return ""; // don't display until threshold reached
    }

    // Format as MM:SS
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes < 10 ? `0${minutes}` : minutes}:${seconds < 10 ? `0${seconds}` : seconds}`;
  };

  // Set up interval to update title while loading
  useEffect(() => {
    const { startTime, isRunning } = options || {};

    if (startTime != null && isRunning) {
      // Update every 100ms while running
      intervalRef.current = setInterval(() => {
        setRefreshTrigger((prev) => prev + 1);
      }, 100);
    } else {
      // Clear interval when not running
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [options]);

  // Construct final title with loading time if applicable
  const loadingTimeTitle = getLoadingTimeTitle();
  const finalTitle = loadingTimeTitle ? `${loadingTimeTitle} ${title}` : title;

  // Use regular usePageTitle with the constructed title
  usePageTitle(finalTitle, { titleIndex: options?.titleIndex });
}
