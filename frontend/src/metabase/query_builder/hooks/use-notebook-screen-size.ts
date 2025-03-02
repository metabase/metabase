import { useWindowSize } from "react-use";

const INITIAL_WINDOW_WIDTH = Infinity;

const BREAKPOINT = 1280;

const NOT_MOUNTED_YET = undefined;

type NotMountedYet = typeof NOT_MOUNTED_YET;

type NotebookScreenSize = {
  isSmallScreen: boolean | NotMountedYet;
  isLargeScreen: boolean | NotMountedYet;
};

export const useNotebookScreenSize = (): NotebookScreenSize => {
  const { width: windowWidth } = useWindowSize(INITIAL_WINDOW_WIDTH);
  const isMounted = Number.isFinite(windowWidth);
  const isBelowBreakpoint = windowWidth < BREAKPOINT;

  return {
    isSmallScreen: isMounted ? isBelowBreakpoint : NOT_MOUNTED_YET,
    isLargeScreen: isMounted ? !isBelowBreakpoint : NOT_MOUNTED_YET,
  };
};
