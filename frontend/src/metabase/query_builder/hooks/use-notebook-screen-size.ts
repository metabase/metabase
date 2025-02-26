import { useWindowSize } from "react-use";

type NotMountedYet = undefined;

type NotebookScreenSize = {
  isSmallScreen: boolean | NotMountedYet;
  isLargeScreen: boolean | NotMountedYet;
};

const INITIAL_WINDOW_WIDTH = Infinity;

const BREAKPOINT = 1280;

export const useNotebookScreenSize = (): NotebookScreenSize => {
  const { width: windowWidth } = useWindowSize(INITIAL_WINDOW_WIDTH);
  const isMounted = Number.isFinite(windowWidth);
  const isBelowBreakpoint = windowWidth < BREAKPOINT;

  return {
    isSmallScreen: isMounted ? isBelowBreakpoint : undefined,
    isLargeScreen: isMounted ? !isBelowBreakpoint : undefined,
  };
};
