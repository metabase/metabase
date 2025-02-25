import { useWindowSize } from "react-use";

const INITIAL_WINDOW_WIDTH = Infinity;

const isSmallScreen = (width: number): boolean => width < 1280;

export const useNotebookNativePreview = () => {
  const { width: windowWidth } = useWindowSize(INITIAL_WINDOW_WIDTH);
  const isWindowSizeInitialized = Number.isFinite(windowWidth);
  const disabled = !isWindowSizeInitialized || isSmallScreen(windowWidth);

  return {
    disabled,
    isSmallScreen: isSmallScreen(windowWidth),
  };
};
