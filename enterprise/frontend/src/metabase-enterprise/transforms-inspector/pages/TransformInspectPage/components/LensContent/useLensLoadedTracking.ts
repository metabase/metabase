import { useCallback, useRef } from "react";

import { trackTransformInspectLensLoaded } from "metabase/transforms/analytics";
import type { TransformId } from "metabase-types/api";

import type { LensKey } from "../../types";

export const useLensLoadedTracking = (
  transformId: TransformId,
  lensKey: LensKey,
) => {
  const lensStartTimeRef = useRef<number>(Date.now());
  const hasCalledRef = useRef(false);

  const handleAllCardsLoaded = useCallback(() => {
    if (hasCalledRef.current) {
      return;
    }
    hasCalledRef.current = true;
    trackTransformInspectLensLoaded({
      transformId,
      lensKey,
      durationMs: Date.now() - lensStartTimeRef.current,
    });
  }, [transformId, lensKey]);

  return handleAllCardsLoaded;
};
