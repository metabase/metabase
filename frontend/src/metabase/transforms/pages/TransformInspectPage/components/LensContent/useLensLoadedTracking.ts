import { useCallback, useRef } from "react";

import { trackTransformInspectLensLoaded } from "metabase/transforms/analytics";
import type { InspectorLensId, TransformId } from "metabase-types/api";

export const useLensLoadedTracking = (
  transformId: TransformId,
  lensId: InspectorLensId,
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
      lensId,
      durationMs: Date.now() - lensStartTimeRef.current,
    });
  }, [transformId, lensId]);

  return handleAllCardsLoaded;
};
