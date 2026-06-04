import { useMemo } from "react";

import type { ProjectionInfo } from "metabase/metrics-viewer/utils";

export function useProjectionControlsVisibility(
  projectionInfo: ProjectionInfo,
) {
  return useMemo(() => {
    const hasFilterControls =
      !!projectionInfo.projection && !!projectionInfo.filterDimension;
    const hasBucketControls =
      hasFilterControls && projectionInfo.isTemporalBucketable;
    const hasBinningControls =
      !hasBucketControls &&
      !!projectionInfo.projection &&
      !!projectionInfo.projectionDimension &&
      (projectionInfo.isBinnable || projectionInfo.hasBinning);
    const hasCenterControls =
      hasFilterControls || hasBucketControls || hasBinningControls;

    return {
      hasBinningControls,
      hasBucketControls,
      hasCenterControls,
      hasFilterControls,
    };
  }, [projectionInfo]);
}
