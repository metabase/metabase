import d3, { max, min } from "d3";
import {
  scaleBand,
  scaleLinear,
  scaleLog,
  scalePower,
  scaleTime,
} from "@visx/scale";
import {
  getX,
  getY,
} from "metabase/static-viz/components/XYChart/utils/series";
import type {
  ContinuousDomain,
  Range,
} from "metabase/visualizations/shared/types/scale";
import type {
  SeriesDatum,
  XAxisType,
  Series,
  YAxisType,
  HydratedSeries,
  StackedDatum,
  XScale,
} from "metabase/static-viz/components/XYChart/types";

export const createXScale = (
  series: Series[],
  range: Range,
  axisType: XAxisType,
): XScale => {
  const hasBars = series.some(series => series.type === "bar");
  const isOrdinal = axisType === "ordinal";

  // TODO: for now use band scale when we have bars even for linear or time scales
  const shouldUseBandScale = isOrdinal || hasBars;

  if (shouldUseBandScale) {
    const domain = series
      .flatMap(series => series.data)
      .map(datum => getX(datum).valueOf());

    const xScale = scaleBand({
      domain,
      range,
      padding: 0.2,
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
    });

    return {
      scale: xScale,
      lineAccessor: (datum: SeriesDatum) =>
        xScale(new Date(getX(datum).valueOf())),
    };
  }

  const values = series
    .flatMap(series => series.data)
    .map(datum => parseInt(getX(datum).toString()));
  const domain = d3.extent(values);
  const xScale = scaleLinear({
    range,
    domain,
  });

  return {
    scale: xScale,
    lineAccessor: (datum: SeriesDatum) =>
      xScale(parseInt(getX(datum).toString())),
  };
};

const calculateYDomain = (
  series: HydratedSeries[],
  minValueSetting?: number,
  maxValueSetting?: number,
  goalValue?: number,
): ContinuousDomain => {
  const values = series
    .flatMap<SeriesDatum | StackedDatum>(
      series => series.stackedData ?? series.data,
    )
    .map(datum => getY(datum));
  const minValue = min(values);
  const maxValue = max(values);

  return [
    Math.min(0, minValue, minValueSetting ?? 0, goalValue ?? 0),
    Math.max(0, maxValue, maxValueSetting ?? 0, goalValue ?? 0),
  ];
};

export const calculateYDomains = (
  series: HydratedSeries[],
  minValueSetting?: number,
  maxValueSetting?: number,
  goalValue?: number,
) => {
  const leftScaleSeries = series.filter(
    series => series.yAxisPosition === "left",
  );
  const rightScaleSeries = series.filter(
    series => series.yAxisPosition === "right",
  );

  if (leftScaleSeries.length > 0 && rightScaleSeries.length === 0) {
    return {
      left: calculateYDomain(
        leftScaleSeries,
        minValueSetting,
        maxValueSetting,
        goalValue,
      ),
    };
  }
  if (rightScaleSeries.length > 0 && leftScaleSeries.length === 0) {
    return {
      right: calculateYDomain(
        rightScaleSeries,
        minValueSetting,
        maxValueSetting,
        goalValue,
      ),
    };
  }

  return {
    left: calculateYDomain(
      leftScaleSeries,
      minValueSetting,
      maxValueSetting,
      goalValue,
    ),
    right: calculateYDomain(rightScaleSeries, minValueSetting, maxValueSetting),
  };
};

export const createYScale = (
  domain: ContinuousDomain,
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
  range: Range,
  axisType: YAxisType,
  leftYDomain?: ContinuousDomain,
  rightYDomain?: ContinuousDomain,
) => {
  return {
    yScaleLeft: leftYDomain ? createYScale(leftYDomain, range, axisType) : null,
    yScaleRight: rightYDomain
      ? createYScale(rightYDomain, range, axisType)
      : null,
  };
};
