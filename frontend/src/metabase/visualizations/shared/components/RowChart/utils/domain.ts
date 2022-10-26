import { extent } from "d3-array";
import type { Series as D3Series } from "d3-shape";
import { isNotNull } from "metabase/core/utils/array";
import {
  ContinuousDomain,
  ContinuousScaleType,
} from "metabase/visualizations/shared/types/scale";
import { Series } from "../types";

const getExtent = (values: number[]) => {
  const [min, max] = extent(values);
  return [min ?? 0, max ?? 0];
};

export const createYDomain = <TDatum>(
  data: TDatum[],
  series: Series<TDatum>[],
) => {
  // taking first series assuming all series have the same Y-axis values
  return data.map(datum => series[0].yAccessor(datum));
};

export const createXDomain = <TDatum>(
  data: TDatum[],
  series: Series<TDatum>[],
  additionalValues: number[],
  xScaleType: ContinuousScaleType,
): ContinuousDomain => {
  const allXValues = series.flatMap(series =>
    data.map(datum => series.xAccessor(datum)).filter(isNotNull),
  );
  const [min, max] = getExtent([...allXValues, ...additionalValues]);

  if (xScaleType === "log") {
    return [1, Math.max(max, 1)];
  }

  return [Math.min(min, 0), Math.max(max, 0)];
};

export const createStackedXDomain = <TDatum>(
  stackedSeries: D3Series<TDatum, string>[],
  additionalValues: number[],
  xScaleType: ContinuousScaleType,
): ContinuousDomain => {
  const [min, max] = getExtent([...stackedSeries.flat(2), ...additionalValues]);

  if (xScaleType === "log") {
    return [1, Math.max(max, 1)];
  }

  return [min, max];
};
