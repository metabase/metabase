import { createContext, useContext, useEffect } from "react";

/** Lets an inline editor in a step drive the step's preview. */
export type StepPreviewControls = {
  /** Opens the step's preview on the step's query as it is now. */
  run: () => void;
  /**
   * While true, the open preview follows the step's query: it shows each
   * change at once, instead of asking to refresh.
   */
  setIsLive: (isLive: boolean) => void;
};

export const StepPreviewContext = createContext<StepPreviewControls | null>(
  null,
);

export function useStepPreview() {
  return useContext(StepPreviewContext);
}

/** Keeps the step's preview live while `isLive`, and not after unmounting. */
export function useLiveStepPreview(isLive: boolean) {
  const setIsLive = useStepPreview()?.setIsLive;
  useEffect(() => {
    setIsLive?.(isLive);
    return () => setIsLive?.(false);
  }, [isLive, setIsLive]);
}
