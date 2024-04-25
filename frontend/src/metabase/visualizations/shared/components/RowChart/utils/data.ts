import d3 from "d3";
import type { Series as D3Series } from "d3-shape";
import { stack, stackOffsetDiverging, stackOffsetExpand } from "d3-shape";
import _ from "underscore";

import { formatNullable } from "metabase/lib/formatting/nullable";
import type { SeriesInfo } from "metabase/visualizations/shared/types/data";
import type { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";

import type { BarData, Series, SeriesData, StackOffset } from "../types";

export const StackOffsetFn = {
  diverging: stackOffsetDiverging,
  expand: stackOffsetExpand,
} as const;

export const calculateNonStackedBars = <TDatum>(
  data: TDatum[],
  multipleSeries: Series<TDatum, SeriesInfo>[],
  seriesColors: Record<string, string>,
  xScaleType: ContinuousScaleType,
) => {
  const defaultXValue = xScaleType === "log" ? 1 : 0;
  return multipleSeries.map((series, seriesIndex) => {
    const bars: BarData<TDatum, SeriesInfo>[] = data.map(
      (datum, datumIndex) => {
        const yValue = formatNullable(series.yAccessor(datum));
        const xValue = series.xAccessor(datum);
        const isNegative = xValue != null && xValue < 0;

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
      },
    );

    return {
      bars,
      color: seriesColors[series.seriesKey],
      key: series.seriesKey,
    };
  });
};

// For log scale starting value for stack is 1
// Stacked log charts does not make much sense but we support them, so I replicate the behavior of line/area/bar charts
const patchD3StackDataForLogScale = <TDatum>(
  stackedSeries: D3Series<TDatum, string>[],
) => {
  stackedSeries.forEach(series => {
    series.forEach(datum => {
      datum.forEach((value, index) => {
        if (value === 0) {
          datum[index] = 1;
        }
      });
    });
  });
};

export const calculateStackedBars = <TDatum>(
  data: TDatum[],
  multipleSeries: Series<TDatum, SeriesInfo>[],
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

  const d3Stack = stack<TDatum>()
    .keys(multipleSeries.map(s => s.seriesKey))
    .value((datum, seriesKey) => seriesByKey[seriesKey].xAccessor(datum) ?? 0)
    .offset(StackOffsetFn[stackOffset ?? "diverging"]);

  const stackedSeries = d3Stack(data);

  if (xScaleType === "log") {
    patchD3StackDataForLogScale(stackedSeries);
  }

  const getDatumExtent = _.memoize(
    (stackedSeries: D3Series<TDatum, string>[], datumIndex: number) => {
      return d3.extent(stackedSeries.flatMap(series => series[datumIndex]));
    },
    (_series, datumIndex) => datumIndex,
  );

  const seriesData: SeriesData<TDatum, SeriesInfo>[] = multipleSeries.map(
    (series, seriesIndex) => {
      const bars: BarData<TDatum, SeriesInfo>[] = data.map(
        (datum, datumIndex) => {
          const [datumMin, datumMax] = getDatumExtent(
            stackedSeries,
            datumIndex,
          );
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
        },
      );

      return {
        bars,
        key: series.seriesKey,
        color: seriesColors[series.seriesKey],
      };
    },
  );

  return seriesData;
};
