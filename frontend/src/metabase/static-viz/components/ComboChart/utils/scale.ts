import { ChartSize } from "../types";

export const getXRangeMax = (size: ChartSize) =>
  size.dimensions.width - size.margins.right - size.margins.left;

export const getYRangeMax = (size: ChartSize) =>
  size.dimensions.height - size.margins.top - size.margins.bottom;
