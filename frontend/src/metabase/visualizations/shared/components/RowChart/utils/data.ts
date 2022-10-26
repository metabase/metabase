import _ from "underscore";
import { stack, stackOffsetDiverging, stackOffsetExpand } from "d3-shape";
import type { Series as D3Series } from "d3-shape";
import d3 from "d3";

import {
  ContinuousScaleType,
  Range,
} from "metabase/visualizations/shared/types/scale";
import { isNotNull } from "metabase/core/utils/array";
import { BarData, Series, SeriesData, StackOffset } from "../types";
import { createXScale, createYScale } from "./scale";
import { createStackedXDomain, createXDomain } from "./domain";

export const StackOffsetFn = {
  diverging: stackOffsetDiverging,
  expand: stackOffsetExpand,
} as const;

type CalculatedStackedChartInput<TDatum> = {
  data: TDatum[];
  multipleSeries: Series<TDatum>[];
  stackOffset: StackOffset;
  additionalXValues: number[];
  innerWidth: number;
  innerHeight: number;
  seriesColors: Record<string, string>;
  xScaleType: ContinuousScaleType;
  xValueRange?: Range;
};

export const calculateStackedBars = <TDatum>({
  data,
  multipleSeries,
  stackOffset,
  additionalXValues,
  innerWidth,
  innerHeight,
  seriesColors,
  xScaleType,
  xValueRange,
}: CalculatedStackedChartInput<TDatum>) => {
  const seriesByKey = multipleSeries.reduce<Record<string, Series<TDatum>>>(
    (acc, series) => {
      acc[series.seriesKey] = series;
      return acc;
    },
    {},
  );

  const d3Stack = stack<TDatum>()
    .keys(multipleSeries.map(s => s.seriesKey))
    .value((datum, seriesKey) => seriesByKey[seriesKey].xAccessor(datum) ?? 0)
    .offset(StackOffsetFn[stackOffset ?? "diverging"]);

  const stackedSeries = d3Stack(data);

  // For log scale starting value for stack is 1
  // Stacked log charts does not make much sense but we support them, so I replicate the behavior of line/area/bar charts
  if (xScaleType === "log") {
    stackedSeries[0].forEach((_, index) => {
      stackedSeries[0][index][0] = 1;
    });
  }

  const yScale = createYScale(data, multipleSeries, innerHeight);

  const xDomain =
    xValueRange ??
    createStackedXDomain(stackedSeries, additionalXValues, xScaleType);
  const xScale = createXScale(
    xDomain,
    [0, innerWidth],
    xScaleType,
    !!xValueRange,
  );

  const getDatumExtent = _.memoize(
    (stackedSeries: D3Series<TDatum, string>[], datumIndex: number) => {
      return d3.extent(stackedSeries.flatMap(series => series[datumIndex]));
    },
    (_series, datumIndex) => datumIndex,
  );

  const seriesData: SeriesData<TDatum>[] = multipleSeries.map(
    (series, seriesIndex) => {
      const bars = data.map<BarData<TDatum>>((originalDatum, datumIndex) => {
        const [datumMin, datumMax] = getDatumExtent(stackedSeries, datumIndex);
        const stackedDatum = stackedSeries[seriesIndex][datumIndex];

        const [xStartValue, xEndValue] = stackedDatum;

        const yValue = series.yAccessor(stackedDatum.data);
        const isNegative = xStartValue < 0;
        const isBorderValue =
          (isNegative && xStartValue === datumMin) ||
          (!isNegative && xEndValue === datumMax);

        return {
          xStartValue,
          xEndValue,
          yValue,
          isNegative,
          originalDatum,
          datumIndex,
          isBorderValue,
        };
      });

      return {
        bars,
        key: series.seriesKey,
        color: seriesColors[series.seriesKey],
      };
    },
  );

  return {
    xDomain,
    xScale,
    yScale,
    seriesData,
  };
};

type CalculatedNonStackedChartInput<TDatum> = {
  data: TDatum[];
  multipleSeries: Series<TDatum>[];
  additionalXValues: number[];
  innerWidth: number;
  innerHeight: number;
  seriesColors: Record<string, string>;
  xScaleType: ContinuousScaleType;
  xValueRange?: Range;
};

export const calculateNonStackedBars = <TDatum>({
  data,
  multipleSeries,
  additionalXValues,
  innerWidth,
  innerHeight,
  seriesColors,
  xScaleType,
  xValueRange,
}: CalculatedNonStackedChartInput<TDatum>) => {
  const yScale = createYScale(data, multipleSeries, innerHeight);
  const xDomain =
    xValueRange ??
    createXDomain(data, multipleSeries, additionalXValues, xScaleType);
  const xScale = createXScale(
    xDomain,
    [0, innerWidth],
    xScaleType,
    !!xValueRange,
  );

  const seriesData: SeriesData<TDatum>[] = multipleSeries.map(series => {
    const bars = data
      .map<BarData<TDatum> | null>((datum, datumIndex) => {
        const yValue = series.yAccessor(datum);
        const xValue = series.xAccessor(datum);
        const isNegative = xValue != null && xValue < 0;

        if (xValue == null) {
          return null;
        }

        const defaultValue = xScaleType === "log" ? 1 : 0;
        const xStartValue = isNegative ? xValue : defaultValue;
        const xEndValue = isNegative ? defaultValue : xValue;

        return {
          isNegative,
          xStartValue,
          xEndValue,
          yValue,
          originalDatum: datum,
          datumIndex,
        };
      })
      .filter(isNotNull);

    return {
      bars,
      color: seriesColors[series.seriesKey],
      key: series.seriesKey,
    };
  });

  return { xDomain, xScale, yScale, seriesData };
};
