import { useEffect, useRef, useState } from "react";

import { useSdkQuestionContext } from "../context";
import { getLastVisibleStageIndex } from "../utils/stages";

const TOOLTIP_DURATION_MS = 3000;

/**
 * Tracks the visible stage index and shows a tooltip for 3 seconds
 * when the stage decreases (i.e. both parts of the current stage were removed,
 * causing a fallback to a previous stage).
 */
export function useStageChangeTooltip() {
  const { question } = useSdkQuestionContext();
  const query = question?.query();
  const stageIndex = getLastVisibleStageIndex(query);

  const prevStageIndexRef = useRef(stageIndex);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const prevStageIndex = prevStageIndexRef.current;
    prevStageIndexRef.current = stageIndex;

    if (prevStageIndex > stageIndex) {
      setShowTooltip(true);

      const timer = setTimeout(
        () => setShowTooltip(false),
        TOOLTIP_DURATION_MS,
      );

      return () => clearTimeout(timer);
    }
  }, [stageIndex]);

  return showTooltip;
}
