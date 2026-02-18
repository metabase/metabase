import { useCallback, useRef } from "react";

import { trackTransformInspectLensLoaded } from "metabase/transforms/analytics";
import type { TransformId } from "metabase-types/api";

export const useLensLoadedTracking = (
  transformId: TransformId,
  lensId: string,
) => {
  const lensStartTimeRef = useRef<number>(Date.now());

  const handleAllCardsLoaded = useCallback(() => {
    trackTransformInspectLensLoaded({
      transformId,
      lensId,
      durationMs: Date.now() - lensStartTimeRef.current,
    });
  }, [transformId, lensId]);

  return handleAllCardsLoaded;
};
