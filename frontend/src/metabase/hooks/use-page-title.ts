import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";
import _ from "underscore";

type TitleEntry = {
  id: string;
  title: string;
  titleIndex: number;
};

const titleMap = new Map<string, TitleEntry>();
const SEPARATOR = " · ";

const updateDocumentTitle = _.debounce(() => {
  document.title = Array.from(titleMap.values())
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
 * with " · " separator. Higher index titles appear first.
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

    titleMap.set(id, { id, title, titleIndex });
    updateDocumentTitle();

    return () => {
      titleMap.delete(id);
      updateDocumentTitle();
    };
  }, [title, titleIndex]);
}

const SECONDS_UNTIL_DISPLAY = 10;

/**
 * Hook to set page title with optional loading time display.
 *
 * Displays the loading time in MM:SS format in the page title. Updates every 100ms.
 */
export function usePageTitleWithLoadingTime(
  title: string,
  options: {
    titleIndex?: number;
    startTime: number | null;
    isRunning: boolean;
  },
) {
  const [, setRefreshTrigger] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { startTime, isRunning } = options || {};

  useEffect(() => {
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
  }, [startTime, isRunning]);

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
