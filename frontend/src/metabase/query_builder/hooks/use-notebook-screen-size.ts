import { useWindowSize } from "react-use";

const INITIAL_WINDOW_WIDTH = Infinity;

const BREAKPOINT = 1280;

const NOT_MOUNTED_YET = undefined;

type NotMountedYet = typeof NOT_MOUNTED_YET;

type NotebookScreenSize = "small" | "large" | NotMountedYet;

export const useNotebookScreenSize = (): NotebookScreenSize => {
  const { width: windowWidth } = useWindowSize(INITIAL_WINDOW_WIDTH);
  const isMounted = Number.isFinite(windowWidth);
  const isBelowBreakpoint = windowWidth < BREAKPOINT;

  if (!isMounted) {
    return NOT_MOUNTED_YET;
  }

  return isBelowBreakpoint ? "small" : "large";
};
