import { scaleLinear, scaleQuantile } from "d3-scale";

import type { Extent } from "metabase/visualizations/types";

export const getColorScale = (
  extent: Extent,
  colors: string[],
  isQuantile: boolean = false,
) => {
  return isQuantile
    ? getQuantileColorScale(extent, colors)
    : getLinearColorScale(extent, colors);
};

export const getQuantileColorScale = (extent: Extent, colors: string[]) => {
  return scaleQuantile<string>(extent, colors);
};

export const getLinearColorScale = (extent: Extent, colors: string[]) => {
  const [start, end] = extent;

  const domain =
    colors.length === 3
      ? [start, start + (end - start) / 2, end]
      : [start, end];

  return scaleLinear<string>(domain, colors);
};
