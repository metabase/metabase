import _ from "underscore";

import { stack, stackOffsetExpand, stackOffsetNone } from "d3-shape";
import type { Series as D3Series, SeriesPoint } from "d3-shape";
import { scaleBand } from "@visx/scale";
import type { ScaleBand, ScaleLinear } from "d3-scale";
import { TextMeasurer } from "metabase/visualizations/shared/types/measure-text";
import { Margin } from "metabase/visualizations/shared/types/layout";
import { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";
import { ChartFont } from "metabase/visualizations/shared/types/style";
import { LABEL_PADDING } from "../constants";
import { Series } from "../types";
import { createStackedXScale, createXScale, createYScale } from "./scale";

const CHART_PADDING = 10;
const TICKS_OFFSET = 10;
const GOAL_LINE_PADDING = 14;

export const getMaxWidth = (
  formattedYTicks: string[],
  ticksFont: ChartFont,
  measureText: TextMeasurer,
): number => {
  return Math.max(
    ...formattedYTicks.map(tick =>
      measureText(tick, {
        size: `${ticksFont.size}px`,
        family: "Lato",
        weight: String(ticksFont.weight ?? 400),
      }),
    ),
  );
};

export const getChartMargin = <TDatum>(
  data: TDatum[],
  series: Series<TDatum, unknown>[],
  yTickFormatter: (value: any) => string,
  ticksFont: ChartFont,
  labelFont: ChartFont,
  hasGoalLine: boolean,
  measureText: TextMeasurer,
  xLabel?: string | null,
  yLabel?: string | null,
): Margin => {
  const yTicksWidth = getMaxWidth(
    data.flatMap(datum =>
      series.map(series => yTickFormatter(series.yAccessor(datum))),
    ),
    ticksFont,
    measureText,
  );

  const margin: Margin = {
    top: hasGoalLine ? GOAL_LINE_PADDING : CHART_PADDING,
    left:
      yTicksWidth +
      TICKS_OFFSET +
      CHART_PADDING +
      (yLabel != null ? LABEL_PADDING + labelFont.size : 0),
    bottom:
      CHART_PADDING +
      TICKS_OFFSET +
      ticksFont.size +
      (xLabel != null ? LABEL_PADDING + labelFont.size : 0),
    right: CHART_PADDING,
  };

  return margin;
};

export const getMaxYValuesCount = (
  viewportHeight: number,
  minBarWidth: number,
  isStacked: boolean,
  seriesCount: number,
) => {
  const singleValueHeight = isStacked ? minBarWidth : minBarWidth * seriesCount;

  return Math.max(Math.floor(viewportHeight / singleValueHeight), 1);
};

export type StackingOffset = "none" | "expand" | null;

const StackingOffsetFn = {
  none: stackOffsetNone,
  expand: stackOffsetExpand,
} as const;

export type ChartBar = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  value: number | null;
};

const getStackedBar = <TDatum>(
  stackedDatum: SeriesPoint<TDatum>,
  series: Series<TDatum>,
  xScale: ScaleLinear<number, number, never>,
  yScale: ScaleBand<string>,
  color: string,
  shouldIncludeValue: boolean,
): ChartBar | null => {
  const [xStartDomain, xEndDomain] = stackedDatum;

  const x = xScale(xStartDomain);
  const width = Math.abs(xScale(xEndDomain) - x);

  const height = yScale.bandwidth();
  const y = yScale(series.yAccessor(stackedDatum.data)) ?? 0;

  return {
    x,
    y,
    height,
    width,
    color,
    value: shouldIncludeValue ? xEndDomain : null,
  };
};

type CalculatedStackedChartInput<TDatum> = {
  data: TDatum[];
  multipleSeries: Series<TDatum>[];
  stackingOffset: StackingOffset;
  additionalXValues: number[];
  innerWidth: number;
  innerHeight: number;
  seriesColors: Record<string, string>;
  xScaleType?: ContinuousScaleType;
};

export const calculateStackedBars = <TDatum>({
  data,
  multipleSeries,
  stackingOffset,
  additionalXValues,
  innerWidth,
  innerHeight,
  seriesColors,
  xScaleType,
}: CalculatedStackedChartInput<TDatum>) => {
  const seriesByKey = multipleSeries.reduce((acc, series) => {
    acc[series.seriesKey] = series;
    return acc;
  }, {} as Record<string, Series<TDatum>>);

  const d3Stack = stack<TDatum>()
    .keys(multipleSeries.map(s => s.seriesKey))
    .value((datum, seriesKey) => {
      return seriesByKey[seriesKey].xAccessor(datum) ?? 0;
    })
    .offset(StackingOffsetFn[stackingOffset ?? "none"]);

  const stackedSeries = d3Stack(data);

  const yScale = createYScale(data, multipleSeries, innerHeight);
  const xScale = createStackedXScale(
    stackedSeries,
    additionalXValues,
    [0, innerWidth],
    xScaleType,
  );

  const bars = multipleSeries.map((series, seriesIndex) => {
    return data.map((_datum, datumIndex) => {
      const stackedDatum = stackedSeries[seriesIndex][datumIndex];
      const shouldIncludeValue =
        seriesIndex === multipleSeries.length - 1 && stackingOffset === "none";

      return getStackedBar(
        stackedDatum,
        series,
        xScale,
        yScale,
        seriesColors[series.seriesKey],
        shouldIncludeValue,
      );
    });
  });

  return {
    xScale,
    yScale,
    bars,
  };
};

const getNonStackedBar = <TDatum>(
  datum: TDatum,
  series: Series<TDatum>,
  xScale: ScaleLinear<number, number, never>,
  yScale: ScaleBand<string>,
  innerBarScale: ScaleBand<number> | null,
  seriesIndex: number,
  color: string,
): ChartBar | null => {
  const yValue = series.yAccessor(datum);
  const xValue = series.xAccessor(datum);
  const isNegative = xValue != null && xValue < 0;

  if (xValue == null) {
    return null;
  }

  const x = xScale(isNegative ? xValue : 0);
  const width = Math.abs(xScale(isNegative ? 0 : xValue) - x);

  const height = innerBarScale?.bandwidth() ?? yScale.bandwidth();
  const innerY = innerBarScale?.(seriesIndex) ?? 0;
  const y = innerY + (yScale(yValue) ?? 0);

  return {
    x,
    y,
    height,
    width,
    value: xValue,
    color,
  };
};

type CalculatedNonStackedChartInput<TDatum> = {
  data: TDatum[];
  multipleSeries: Series<TDatum>[];
  additionalXValues: number[];
  innerWidth: number;
  innerHeight: number;
  seriesColors: Record<string, string>;
  xScaleType?: ContinuousScaleType;
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
  const xScale = createXScale(
    data,
    multipleSeries,
    additionalXValues,
    [0, innerWidth],
    xScaleType,
  );

  const innerBarScale = scaleBand({
    domain: multipleSeries.map((_, index) => index),
    range: [0, yScale.bandwidth()],
  });

  const bars = multipleSeries.map((series, seriesIndex) => {
    return data.map(datum => {
      return getNonStackedBar(
        datum,
        series,
        xScale,
        yScale,
        innerBarScale,
        seriesIndex,
        seriesColors[series.seriesKey],
      );
    });
  });

  return { xScale, yScale, bars };
};
