import {
  ContinuousDomain,
  scaleBand,
  scaleLinear,
  scaleLog,
  scalePower,
} from "@visx/scale";
import type { ScaleContinuousNumeric } from "d3-scale";
import { ValueFormatter } from "metabase/visualizations/shared/types/format";
import { TextMeasurer } from "metabase/visualizations/shared/types/measure-text";
import {
  ContinuousScaleType,
  Range,
} from "metabase/visualizations/shared/types/scale";
import { ChartFont } from "metabase/visualizations/shared/types/style";
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

const getTickInfo = (
  tick: number,
  tickFormatter: ValueFormatter,
  tickFont: ChartFont,
  measureText: TextMeasurer,
  xScale: ScaleContinuousNumeric<number, number, never>,
) => {
  return {
    value: tick,
    tickX: xScale(tick),
    formatted: tickFormatter(tick),
    tickWidth: measureText(tickFormatter(tick), tickFont),
  };
};

export const addSideSpacingForXScale = (
  xScale: ScaleContinuousNumeric<number, number, never>,
  measureText: TextMeasurer,
  ticks: number[],
  tickFont: ChartFont,
  tickFormatter: ValueFormatter,
  labelFont: ChartFont,
  labelFormatter: ValueFormatter,
  shouldShowLabels?: boolean,
) => {
  const [rangeMin, rangeMax] = xScale.range();
  const [domainMin, domainMax] = xScale.domain();
  let [leftPadding, rightPadding] = [0, 0];

  const minTick = getTickInfo(
    ticks[0],
    tickFormatter,
    tickFont,
    measureText,
    xScale,
  );

  if (minTick.value < 0) {
    const minTickOverflow = rangeMin - (minTick.tickX - minTick.tickWidth / 2);
    const leftLabelOverflow = shouldShowLabels
      ? rangeMin -
        (xScale(domainMin) - measureText(labelFormatter(domainMin), labelFont))
      : 0;
    leftPadding = Math.max(0, minTickOverflow, leftLabelOverflow);
  }

  const maxTick = getTickInfo(
    ticks[ticks.length - 1],
    tickFormatter,
    tickFont,
    measureText,
    xScale,
  );
  const maxTickOverflow = maxTick.tickX + maxTick.tickWidth / 2 - rangeMax;
  const rightLabelOverflow = shouldShowLabels
    ? xScale(domainMax) +
      measureText(labelFormatter(domainMax), labelFont) -
      rangeMax
    : 0;

  rightPadding = Math.max(0, maxTickOverflow, rightLabelOverflow);

  return addScalePadding(xScale, leftPadding, rightPadding);
};
