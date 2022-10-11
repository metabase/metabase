import {
  ContinuousDomain,
  scaleBand,
  scaleLinear,
  scaleLog,
  scalePower,
} from "@visx/scale";
import type { ScaleContinuousNumeric } from "d3-scale";
import {
  ContinuousScaleType,
  Range,
} from "metabase/visualizations/shared/types/scale";
import { Series } from "../types";
import { createYDomain } from "./domain";

export const createYScale = <TDatum>(
  data: TDatum[],
  series: Series<TDatum>[],
  chartHeight: number,
) => {
  return scaleBand({
    domain: createYDomain(data, series),
    range: [0, chartHeight],
    padding: 0.2,
  });
};

export const createXScale = (
  domain: ContinuousDomain,
  range: Range,
  type: ContinuousScaleType = "linear",
) => {
  switch (type) {
    case "pow":
      return scalePower({
        range,
        domain,
        exponent: 2,
      });
    case "log":
      return scaleLog({
        range,
        domain,
        base: 10,
      });
    default:
      return scaleLinear({
        range,
        domain,
        nice: true,
      });
  }
};

export const addScalePadding = (
  scale: ScaleContinuousNumeric<number, number, never>,
  paddingStart: number = 0,
  paddingEnd: number = 0,
) => {
  const [start, end] = scale.range();
  const adjustedDomainStart = scale.invert(start - paddingStart);
  const adjustedDomainEnd = scale.invert(end + paddingEnd);

  return scale.domain([adjustedDomainStart, adjustedDomainEnd]);
};
