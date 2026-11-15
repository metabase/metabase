import type { ProjectionInfo } from "metabase/metrics-viewer/utils";

export const hasFilterControls = (projectionInfo: ProjectionInfo) => {
  return !!projectionInfo.projection && !!projectionInfo.filterDimension;
};

export const hasBucketControls = (projectionInfo: ProjectionInfo) => {
  return (
    hasFilterControls(projectionInfo) && projectionInfo.isTemporalBucketable
  );
};

export const hasBinningControls = (projectionInfo: ProjectionInfo) => {
  return (
    !hasBucketControls(projectionInfo) &&
    !!projectionInfo.projection &&
    !!projectionInfo.projectionDimension &&
    (projectionInfo.isBinnable || projectionInfo.hasBinning)
  );
};

export const hasCenterControls = (projectionInfo: ProjectionInfo) => {
  return (
    hasFilterControls(projectionInfo) ||
    hasBucketControls(projectionInfo) ||
    hasBinningControls(projectionInfo)
  );
};
