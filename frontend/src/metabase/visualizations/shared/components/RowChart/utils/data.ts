import _ from "underscore";
import { stack, stackOffsetDiverging, stackOffsetExpand } from "d3-shape";
import type { Series as D3Series } from "d3-shape";
import d3 from "d3";
import { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";
import { isNotNull } from "metabase/core/utils/types";
import { formatNullable } from "metabase/lib/formatting/nullable";
import { BarData, Series, SeriesData, StackOffset } from "../types";

export const StackOffsetFn = {
  diverging: stackOffsetDiverging,
  expand: stackOffsetExpand,
} as const;

export const calculateNonStackedBars = <TDatum>(
  data: TDatum[],
  multipleSeries: Series<TDatum>[],
  seriesColors: Record<string, string>,
  xScaleType: ContinuousScaleType,
): SeriesData<TDatum>[] => {
  const defaultXValue = xScaleType === "log" ? 1 : 0;
  return multipleSeries.map((series, seriesIndex) => {
    const bars: BarData<TDatum>[] = data
      .map((datum, datumIndex) => {
        const yValue = formatNullable(series.yAccessor(datum));
        const xValue = series.xAccessor(datum);
        const isNegative = xValue != null && xValue < 0;

        if (xValue == null) {
          return null;
        }

        const xStartValue = isNegative ? xValue : defaultXValue;
        const xEndValue = isNegative ? defaultXValue : xValue;

        return {
          isNegative,
          xStartValue,
          xEndValue,
          yValue,
          datum,
          datumIndex,
          series,
          seriesIndex,
        };
      })
      .filter(isNotNull);

    return {
      bars,
      color: seriesColors[series.seriesKey],
      key: series.seriesKey,
    };
  });
};

export const calculateStackedBars = <TDatum>(
  data: TDatum[],
  multipleSeries: Series<TDatum>[],
  stackOffset: StackOffset,
  seriesColors: Record<string, string>,
  xScaleType: ContinuousScaleType,
) => {
  const seriesByKey = multipleSeries.reduce<Record<string, Series<TDatum>>>(
    (acc, series) => {
      acc[series.seriesKey] = series;
      return acc;
    },
    {},
  );

  const defaultXValue = xScaleType === "log" ? 1 : 0;

  const d3Stack = stack<TDatum>()
    .keys(multipleSeries.map(s => s.seriesKey))
    .value((datum, seriesKey) => seriesByKey[seriesKey].xAccessor(datum) ?? 0)
    .offset(StackOffsetFn[stackOffset ?? "diverging"]);

  const stackedSeries = d3Stack(data);

  // For log scale starting value for stack is 1
  // Stacked log charts does not make much sense but we support them, so I replicate the behavior of line/area/bar charts
  if (xScaleType === "log") {
    stackedSeries[0].forEach((_, index) => {
      stackedSeries[0][index][0] = defaultXValue;
    });
  }

  const getDatumExtent = _.memoize(
    (stackedSeries: D3Series<TDatum, string>[], datumIndex: number) => {
      return d3.extent(stackedSeries.flatMap(series => series[datumIndex]));
    },
    (_series, datumIndex) => datumIndex,
  );

  const seriesData: SeriesData<TDatum>[] = multipleSeries.map(
    (series, seriesIndex) => {
      const bars: BarData<TDatum>[] = data.map((datum, datumIndex) => {
        const [datumMin, datumMax] = getDatumExtent(stackedSeries, datumIndex);
        const stackedDatum = stackedSeries[seriesIndex][datumIndex];

        const [xStartValue, xEndValue] = stackedDatum;

        const yValue = formatNullable(series.yAccessor(stackedDatum.data));
        const isNegative = xStartValue < 0;
        const isBorderValue =
          (isNegative && xStartValue === datumMin) ||
          (!isNegative && xEndValue === datumMax);

        return {
          xStartValue,
          xEndValue,
          yValue,
          isNegative,
          isBorderValue,
          datum,
          datumIndex,
          series,
          seriesIndex,
        };
      });

      return {
        bars,
        key: series.seriesKey,
        color: seriesColors[series.seriesKey],
      };
    },
  );

  return seriesData;
};
