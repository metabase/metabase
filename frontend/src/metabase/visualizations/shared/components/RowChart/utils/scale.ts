import type { ContinuousDomain } from "@visx/scale";
import { scaleBand, scaleLinear, scaleLog, scalePower } from "@visx/scale";
import type { ScaleContinuousNumeric } from "d3-scale";

import type { ValueFormatter } from "metabase/visualizations/shared/types/format";
import type { TextWidthMeasurer } from "metabase/visualizations/shared/types/measure-text";
import type {
  ContinuousScaleType,
  Range,
} from "metabase/visualizations/shared/types/scale";
import type { ChartFont } from "metabase/visualizations/shared/types/style";

import { DATA_LABEL_OFFSET } from "../../RowChartView";
import type { SeriesData, StackOffset } from "../types";

import { createXDomain, createYDomain } from "./domain";

export const createXScale = (
  domain: ContinuousDomain,
  range: Range,
  type: ContinuousScaleType = "linear",
  isExactRange: boolean,
): ScaleContinuousNumeric<number, number, never> => {
  switch (type) {
    case "pow":
      return scalePower({
        range,
        domain,
        exponent: 2,
        clamp: isExactRange,
      });
    case "log":
      return scaleLog({
        range,
        domain,
        base: 10,
        clamp: isExactRange,
      });
    default:
      return scaleLinear({
        range,
        domain,
        nice: !isExactRange,
        clamp: isExactRange,
      });
  }
};

export const getChartScales = <TDatum>(
  seriesData: SeriesData<TDatum>[],
  innerHeight: number,
  innerWidth: number,
  additionalXValues: number[],
  xScaleType: ContinuousScaleType,
  stackOffset: StackOffset,
  rangeOverride?: Range,
) => {
  const yDomain = createYDomain(seriesData);
  const yScale = scaleBand({
    domain: yDomain,
    range: [0, innerHeight],
    padding: 0.2,
  });

  const xDomain =
    rangeOverride ?? createXDomain(seriesData, additionalXValues, xScaleType);

  const isExactRange = !!rangeOverride || stackOffset === "expand";
  const xScale = createXScale(
    xDomain,
    [0, innerWidth],
    xScaleType,
    isExactRange,
  );

  return {
    yDomain,
    xDomain,
    yScale,
    xScale,
  };
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
  tickX: number,
  tickFormatter: ValueFormatter,
  tickFont: ChartFont,
  measureTextWidth: TextWidthMeasurer,
  xScale: ScaleContinuousNumeric<number, number, never>,
) => {
  const value = xScale.invert(tickX);

  return {
    value,
    tickX,
    formatted: tickFormatter(value),
    tickWidth: measureTextWidth(tickFormatter(value), tickFont),
  };
};

const Y_AXIS_LEFT_PADDING = 16;

export const addSideSpacingForTicksAndLabels = (
  xScale: ScaleContinuousNumeric<number, number, never>,
  measureTextWidth: TextWidthMeasurer,
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
    rangeMin,
    tickFormatter,
    tickFont,
    measureTextWidth,
    xScale,
  );

  if (minTick.value < 0) {
    const minTickOverflow = rangeMin - (minTick.tickX - minTick.tickWidth / 2);
    const leftLabelOverflow = shouldShowLabels
      ? rangeMin -
        (xScale(domainMin) -
          measureTextWidth(labelFormatter(domainMin), labelFont) -
          DATA_LABEL_OFFSET * 2 -
          Y_AXIS_LEFT_PADDING)
      : 0;

    leftPadding = Math.max(0, minTickOverflow, leftLabelOverflow);
  }

  const maxTick = getTickInfo(
    rangeMax,
    tickFormatter,
    tickFont,
    measureTextWidth,
    xScale,
  );
  const maxTickOverflow = maxTick.tickX + maxTick.tickWidth / 2 - rangeMax;
  const rightLabelOverflow = shouldShowLabels
    ? xScale(domainMax) +
      measureTextWidth(labelFormatter(domainMax), labelFont) +
      DATA_LABEL_OFFSET -
      rangeMax
    : 0;

  rightPadding = Math.max(0, maxTickOverflow, rightLabelOverflow);

  return addScalePadding(xScale, leftPadding, rightPadding);
};
