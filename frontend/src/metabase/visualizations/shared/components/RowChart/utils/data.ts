import _ from "underscore";

import { stack, stackOffsetDiverging, stackOffsetExpand } from "d3-shape";
import { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";
import { isNotEmpty } from "metabase/core/utils/is-not-empty";
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

  const xDomain = createStackedXDomain(
    stackedSeries,
    additionalXValues,
    xScaleType,
  );
  const xScale = createXScale(xDomain, [0, innerWidth], xScaleType);

  const seriesData: SeriesData<TDatum>[] = multipleSeries.map(
    (series, seriesIndex) => {
      const bars = data.map<BarData<TDatum>>((originalDatum, datumIndex) => {
        const stackedDatum = stackedSeries[seriesIndex][datumIndex];

        const xStartValue = Math.min(...stackedDatum);
        const xEndValue = Math.max(...stackedDatum);
        const yValue = series.yAccessor(stackedDatum.data);

        return {
          xStartValue,
          xEndValue,
          yValue,
          isNegative: xStartValue < 0 || xEndValue < 0,
          originalDatum,
          datumIndex,
        };
      });

      const canShowValues = seriesIndex === multipleSeries.length - 1;

      return {
        bars,
        key: series.seriesKey,
        color: seriesColors[series.seriesKey],
        canShowValues,
      };
    },
  );

  return {
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
};

export const calculateNonStackedBars = <TDatum>({
  data,
  multipleSeries,
  additionalXValues,
  innerWidth,
  innerHeight,
  seriesColors,
  xScaleType,
}: CalculatedNonStackedChartInput<TDatum>) => {
  const yScale = createYScale(data, multipleSeries, innerHeight);
  const xDomain = createXDomain(
    data,
    multipleSeries,
    additionalXValues,
    xScaleType,
  );
  const xScale = createXScale(xDomain, [0, innerWidth], xScaleType);

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
      .filter(isNotEmpty);

    return {
      bars,
      color: seriesColors[series.seriesKey],
      key: series.seriesKey,
      canShowValues: true,
    };
  });

  return { xScale, yScale, seriesData };
};
