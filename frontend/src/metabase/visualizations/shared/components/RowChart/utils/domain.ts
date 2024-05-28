import { extent } from "d3-array";

import { isNotNull } from "metabase/lib/types";
import type {
  ContinuousDomain,
  ContinuousScaleType,
} from "metabase/visualizations/shared/types/scale";

import type { SeriesData } from "../types";

const getExtent = (values: number[]) => {
  const [min, max] = extent(values);
  return [min ?? 0, max ?? 0];
};

export const createYDomain = <TDatum>(data: SeriesData<TDatum>[]) => {
  // taking first series assuming all series have the same Y-axis values
  return data[0]?.bars.map(bar => bar.yValue) ?? [];
};

export const createXDomain = <TDatum>(
  data: SeriesData<TDatum>[],
  additionalValues: number[],
  xScaleType: ContinuousScaleType,
): ContinuousDomain => {
  const allXValues = data.flatMap(series =>
    series.bars
      .flatMap(bar => [bar.xStartValue, bar.xEndValue])
      .filter(isNotNull),
  );
  const [min, max] = getExtent([...allXValues, ...additionalValues]);

  if (xScaleType === "log") {
    return [1, Math.max(max, 1)];
  }

  return [Math.min(min, 0), Math.max(max, 0)];
};
