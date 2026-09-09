import { memo } from "react";

import type { VisualizationProps } from "metabase/visualizations/types";
import { isSameSeries } from "metabase/viz-core";

import { MapRenderer } from "./MapRenderer";
import { MAP_VIZ_DEFINITION } from "./definition";

function arePropsEqual(prev: VisualizationProps, next: VisualizationProps) {
  const sameSize = prev.width === next.width && prev.height === next.height;
  const sameSeries = isSameSeries(prev.series, next.series);
  const sameIsEditing = prev.isEditing === next.isEditing;
  const sameHighlighted = prev.highlighted === next.highlighted;

  return sameSize && sameSeries && sameIsEditing && sameHighlighted;
}

export const Map = Object.assign(
  memo(MapRenderer, arePropsEqual),
  MAP_VIZ_DEFINITION,
);
