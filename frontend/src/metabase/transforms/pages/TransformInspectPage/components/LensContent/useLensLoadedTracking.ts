import { useCallback, useRef } from "react";

import { trackTransformInspectLensLoaded } from "metabase/transforms/analytics";
import type { TransformId } from "metabase-types/api";

export const useLensLoadedTracking = (
  transformId: TransformId,
  lensId: string,
  onAllCardsLoaded: (lensId: string) => void,
) => {
  const lensStartTimeRef = useRef<number>(Date.now());
  const prevLensIdRef = useRef<string>(lensId);
  const trackedLensIdRef = useRef<string | null>(null);
  if (prevLensIdRef.current !== lensId) {
    prevLensIdRef.current = lensId;
    lensStartTimeRef.current = Date.now();
    trackedLensIdRef.current = null;
  }

  const handleAllCardsLoaded = useCallback(
    (loadedLensId: string) => {
      if (trackedLensIdRef.current !== loadedLensId) {
        trackedLensIdRef.current = loadedLensId;
        trackTransformInspectLensLoaded({
          transformId,
          lensId: loadedLensId,
          durationMs: Date.now() - lensStartTimeRef.current,
        });
      }
      onAllCardsLoaded(loadedLensId);
    },
    [transformId, onAllCardsLoaded],
  );

  return handleAllCardsLoaded;
};
