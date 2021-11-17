import { scaleBand, scaleLinear, scaleLog, scalePower } from "@visx/scale";
import { getX, getY } from "./seriesAccessors";
import { Range, Series, YAxisType } from "../types";

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

export const createYScale = (
  series: Series[],
  range: Range,
  axisType: YAxisType,
) => {
  const values = series
    .flatMap(series => series.data)
    .map(datum => getY(datum));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const domain = [Math.min(0, minValue), Math.max(0, maxValue)];

  switch (axisType) {
    case "pow":
      return scalePower({
        range,
        domain,
        nice: true,
        exponent: 10,
      });
    case "log":
      return scaleLog({
        range,
        domain,
        nice: true,
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

export const createYScales = (
  series: Series[],
  range: Range,
  axisType: YAxisType,
) => {
  const leftScaleSeries = series.filter(
    series => series.yAxisPosition === "left",
  );
  const rightScaleSeries = series.filter(
    series => series.yAxisPosition === "right",
  );

  return {
    yScaleLeft: createYScale(leftScaleSeries, range, axisType),
    yScaleRight: createYScale(rightScaleSeries, range, axisType),
  };
};
