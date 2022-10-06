import {
  ContinuousDomain,
  scaleBand,
  scaleLinear,
  scaleLog,
  scalePower,
} from "@visx/scale";
import type { Series as D3Series } from "d3-shape";
import { ContinuousScaleType } from "metabase/visualizations/types/scale";
import { Series } from "../types";
import { createStackedXDomain, createXDomain, createYDomain } from "./domain";

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

export const getScaleByType = (
  domain: ContinuousDomain,
  range: number[],
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
        base: 2,
      });
    default:
      return scaleLinear({
        range,
        domain,
        nice: true,
      });
  }
};

export const createXScale = <TDatum>(
  data: TDatum[],
  series: Series<TDatum>[],
  additionalValues: number[],
  range: [number, number],
  type: ContinuousScaleType = "linear",
) => {
  const domain = createXDomain(data, series, additionalValues);
  return getScaleByType(domain, range, type);
};

export const createStackedXScale = <TDatum>(
  stackedSeries: D3Series<TDatum, string>[],
  additionalValues: number[],
  range: [number, number],
  type: ContinuousScaleType = "linear",
) => {
  const domain = createStackedXDomain(stackedSeries, additionalValues);
  return getScaleByType(domain, range, type);
};
