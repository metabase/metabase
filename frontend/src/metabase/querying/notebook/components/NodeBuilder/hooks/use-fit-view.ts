import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";

import { FIT_VIEW_OPTIONS } from "../graph";

// Fits the view on the next frame, once the blocks it should frame are in.
export function useScheduledFitView() {
  const { fitView } = useReactFlow();
  return useCallback(
    (instant = false) => {
      const options = instant
        ? { ...FIT_VIEW_OPTIONS, duration: 0 }
        : FIT_VIEW_OPTIONS;
      window.requestAnimationFrame(() => fitView(options));
    },
    [fitView],
  );
}
