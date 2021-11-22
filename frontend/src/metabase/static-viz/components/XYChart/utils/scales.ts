import d3, { max, min } from "d3";
import {
  SeriesDatum,
  XAxisType,
  ContiniousDomain,
  Range,
  Series,
  YAxisType,
} from "./../types";
import {
  scaleBand,
  scaleLinear,
  scaleLog,
  scalePower,
  scaleTime,
} from "@visx/scale";
import { getX, getY } from "./series";

export const createXScale = (
  series: Series[],
  range: Range,
  axisType: XAxisType,
) => {
  const hasBars = series.some(series => series.type === "bar");
  const isOrdinal = axisType === "ordinal";

  const shouldUseBandScale = hasBars || isOrdinal;

  if (shouldUseBandScale) {
    const domain = series
      .flatMap(series => series.data)
      .map(datum => getX(datum).valueOf());

    const xScale = scaleBand({
      domain,
      range,
      round: true,
      padding: 0.1,
    });

    return {
      scale: xScale,
      bandwidth: xScale.bandwidth(),
      lineAccessor: (datum: SeriesDatum) =>
        (xScale(getX(datum)) || 0) + xScale.bandwidth() / 2,
      barAccessor: (datum: SeriesDatum) => xScale(getX(datum).valueOf()) || 0,
    };
  }

  if (axisType === "timeseries") {
    const values = series
      .flatMap(series => series.data)
      .map(datum => new Date(getX(datum)).valueOf());
    const domain = d3.extent(values);
    const xScale = scaleTime({
      range,
      domain,
      nice: true,
    });

    return {
      scale: xScale,
      lineAccessor: (datum: SeriesDatum) =>
        xScale(new Date(getX(datum).valueOf())),
      nice: true,
    };
  }

  const values = series
    .flatMap(series => series.data)
    .map(datum => parseInt(getX(datum).toString()));
  const domain = d3.extent(values);
  const xScale = scaleLinear({
    range,
    domain,
    // nice: true,
  });

  return {
    scale: xScale,
    lineAccessor: (datum: SeriesDatum) =>
      xScale(parseInt(getX(datum).toString())),
  };
};

const calculateYDomain = (series: Series[]): ContiniousDomain => {
  const values = series
    .flatMap(series => series.data)
    .map(datum => getY(datum));
  const minValue = min(values);
  const maxValue = max(values);

  return [Math.min(0, minValue), Math.max(0, maxValue)];
};

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

  return {
    left: calculateYDomain(leftScaleSeries),
    right: calculateYDomain(rightScaleSeries),
  };
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
