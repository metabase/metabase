import { scaleBand, scaleLinear, scaleLog, scalePower } from "@visx/scale";
import { getX, getY } from "./seriesAccessors";
import { ContiniousDomain, Range, Series, YAxisType } from "../types";
import { max, min } from "d3";

export const createXScale = (series: Series[], range: Range) => {
  const domain = series
    .flatMap(series => series.data)
    .map(datum => getX(datum).valueOf());

  const xScale = scaleBand({
    domain,
    range,
    round: true,
    padding: 0.1,
  });

  return xScale;
};

const calculateYDomain = (series: Series[]): ContiniousDomain => {
  const values = series
    .flatMap(series => series.data)
    .map(datum => getY(datum));
  const minValue = min(values);
  const maxValue = max(values);

  return [Math.min(0, minValue), Math.max(0, maxValue)];
};

// Synchronize 0 position on Y-axes between each other
const calculateYDomains = (series: Series[]) => {
  const leftScaleSeries = series.filter(
    series => series.yAxisPosition === "left",
  );
  const rightScaleSeries = series.filter(
    series => series.yAxisPosition === "right",
  );

  if (leftScaleSeries.length > 0 && rightScaleSeries.length === 0) {
    return { left: calculateYDomain(leftScaleSeries) };
  }
  if (rightScaleSeries.length > 0 && leftScaleSeries.length === 0) {
    return { right: calculateYDomain(rightScaleSeries) };
  }

  let [leftYMin, leftYMax] = calculateYDomain(leftScaleSeries);
  let [rightYMin, rightYMax] = calculateYDomain(rightScaleSeries);

  const leftRatio = leftYMax / (leftYMax - leftYMin);
  const rightRatio = rightYMax / (rightYMax - rightYMin);

  const isZeroAligned =
    (leftYMin > 0 && rightYMin > 0 && rightYMin > 0 && rightYMax > 0) ||
    (leftYMin < 0 && rightYMin < 0 && rightYMin < 0 && rightYMax < 0);

  if (!isZeroAligned && leftRatio !== rightRatio) {
    if (leftRatio < rightRatio) {
      rightYMin = (leftYMin / leftYMax) * rightYMax;
    } else {
      leftYMin = (rightYMin / rightYMax) * leftYMax;
    }
  }

  const left: ContiniousDomain = [leftYMin, leftYMax];
  const right: ContiniousDomain = [rightYMin, rightYMax];

  return { left, right };
};

export const createYScale = (
  domain: ContiniousDomain,
  range: Range,
  axisType: YAxisType,
) => {
  switch (axisType) {
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
      });
  }
};

export const createYScales = (
  series: Series[],
  range: Range,
  axisType: YAxisType,
) => {
  const domains = calculateYDomains(series);

  return {
    yScaleLeft: domains.left
      ? createYScale(domains.left, range, axisType)
      : null,
    yScaleRight: domains.right
      ? createYScale(domains.right, range, axisType)
      : null,
  };
};
