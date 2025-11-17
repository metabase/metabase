import dayjs from "dayjs";
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
 * @param title - The title string
 * @param options - Configuration options
 * @param options.titleIndex - Priority for stacking (default: 0). Controls order in the final title.
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
 */
export function usePageTitle(
  title: string,
  options?: {
    titleIndex?: number;
  },
) {
  const idRef = useRef<string>(`title-${nextId++}`);
  const titleIndex = options?.titleIndex ?? 0;

  useEffect(() => {
    const id = idRef.current;

    // Add to stack
    titleStack.push({ id, title, titleIndex });
    updateDocumentTitle();

    // Cleanup on unmount
    return () => {
      const index = titleStack.findIndex((e) => e.id === id);
      if (index !== -1) {
        titleStack.splice(index, 1);
        updateDocumentTitle();
      }
    };
  }, [title, titleIndex]);
}

const SECONDS_UNTIL_DISPLAY = 10;

/**
 * Hook to set page title with optional loading time display.
 *
 * Displays the loading time in MM:SS format in the page title. Updates every 100ms.
 *
 *
 * @param title - The base title string
 * @param options - Configuration options
 * @param options.titleIndex - Priority for stacking (default: 0)
 * @param options.startTime - Timestamp when loading started
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
  const { startTime, isRunning } = options || {};

  useEffect(() => {
    const { startTime, isRunning } = options || {};

    if (startTime != null && isRunning) {
      intervalRef.current = setInterval(() => {
        setRefreshTrigger((prev) => prev + 1);
      }, 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [options]);

  const getLoadingTime = () => {
    if (startTime == null || !isRunning) {
      return "";
    }
    const totalSeconds = (performance.now() - startTime) / 1000;
    if (totalSeconds < SECONDS_UNTIL_DISPLAY) {
      return ""; // don't display until threshold reached
    }
    return dayjs.duration(totalSeconds, "seconds").format("mm:ss");
  };

  const loadingTime = getLoadingTime();
  const finalTitle = loadingTime ? `${loadingTime} ${title}` : title;
  usePageTitle(finalTitle, { titleIndex: options?.titleIndex });
}
