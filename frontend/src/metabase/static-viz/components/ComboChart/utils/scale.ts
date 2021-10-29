import { ChartSize, Datum } from "../types";

export const getXRangeMax = (size: ChartSize) =>
  size.dimensions.width - size.margins.right - size.margins.left;

export const getYRangeMax = (size: ChartSize) =>
  size.dimensions.height - size.margins.top - size.margins.bottom;

export const getX = <X, Y>(d: Datum<X, Y>) => d[0];
export const getY = <X, Y>(d: Datum<X, Y>) => d[1];
