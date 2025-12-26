import type { NumberValue } from "d3-scale";
import { useMemo } from "react";

import type { HoveredData } from "metabase/visualizations/shared/types/events";
import type { ChartTicksFormatters } from "metabase/visualizations/shared/types/format";
import type { TextWidthMeasurer } from "metabase/visualizations/shared/types/measure-text";

import type { SeriesInfo } from "../../types/data";
import type { ContinuousScaleType, Range } from "../../types/scale";
import type { ChartGoal } from "../../types/settings";
import RowChartView from "../RowChartView/RowChartView";

import type { BarData, RowChartTheme, Series, StackOffset } from "./types";
import { calculateNonStackedBars, calculateStackedBars } from "./utils/data";
import {
  getChartMargin,
  getMaxYValuesCount,
  getRowChartGoal,
} from "./utils/layout";
import { addSideSpacingForTicksAndLabels, getChartScales } from "./utils/scale";
import { getXTicks } from "./utils/ticks";

export const MIN_BAR_HEIGHT = 24;

const defaultFormatter = (value: any) => String(value);

export interface RowChartProps<TDatum> {
  width?: number | null;
  height?: number | null;

  data: TDatum[];
  series: Series<TDatum, SeriesInfo>[];
  seriesColors: Record<string, string>;

  trimData?: (data: TDatum[], maxLength: number) => TDatum[];
  shouldGroupRemainingValues?: boolean;

  goal?: ChartGoal | null;
  theme: RowChartTheme;
  stackOffset: StackOffset;
  labelledSeries?: string[] | null;

  xValueRange?: Range;

  yLabel?: string;
  xLabel?: string;

  hasXAxis?: boolean;
  hasYAxis?: boolean;

  tickFormatters?: ChartTicksFormatters;
  labelsFormatter?: (value: NumberValue) => string;
  measureTextWidth: TextWidthMeasurer;

  xScaleType?: ContinuousScaleType;

  style?: React.CSSProperties;

  hoveredData?: HoveredData | null;
  onClick?: (event: React.MouseEvent, bar: BarData<TDatum, SeriesInfo>) => void;
  onHover?: (
    event: React.MouseEvent,
    bar: BarData<TDatum, SeriesInfo> | null,
  ) => void;
}

export const RowChart = <TDatum,>({
  width,
  height,

  data,
  trimData,
  shouldGroupRemainingValues = true,
  series: multipleSeries,
  seriesColors,

  goal,
  theme,
  stackOffset,
  labelledSeries,

  xLabel,
  yLabel,

  hasXAxis = true,
  hasYAxis = true,

  xValueRange,

  tickFormatters = {
    xTickFormatter: defaultFormatter,
    yTickFormatter: defaultFormatter,
  },
  labelsFormatter = defaultFormatter,

  xScaleType = "linear",

  measureTextWidth,

  style,

  hoveredData,
  onClick,
  onHover,
}: RowChartProps<TDatum>) => {
  const isMeasured = typeof width === "number" && typeof height === "number";
  const maxYValues = useMemo(
    () =>
      isMeasured
        ? getMaxYValuesCount(
            height,
            MIN_BAR_HEIGHT,
            stackOffset != null,
            multipleSeries.length,
          )
        : 0,
    [height, multipleSeries.length, stackOffset, isMeasured],
  );

  const trimmedData = useMemo(() => {
    if (shouldGroupRemainingValues === false || !trimData) {
      return data;
    }

    return trimData(data, maxYValues);
  }, [data, maxYValues, shouldGroupRemainingValues, trimData]);
  const trimmedDataLength = trimmedData.length;

  const seriesData = useMemo(
    () =>
      stackOffset != null
        ? calculateStackedBars<TDatum>(
            trimmedData,
            multipleSeries,
            stackOffset,
            seriesColors,
            xScaleType,
          )
        : calculateNonStackedBars<TDatum>(
            trimmedData,
            multipleSeries,
            seriesColors,
            xScaleType,
          ),
    [stackOffset, trimmedData, multipleSeries, seriesColors, xScaleType],
  );

  const { xTickFormatter, yTickFormatter } = tickFormatters;

  const margin = useMemo(
    () =>
      getChartMargin(
        seriesData,
        yTickFormatter,
        theme.axis.ticks,
        theme.axis.label,
        goal != null,
        measureTextWidth,
        xLabel,
        yLabel,
        hasXAxis,
        hasYAxis,
        width,
      ),
    [
      seriesData,
      yTickFormatter,
      theme.axis.ticks,
      theme.axis.label,
      goal,
      measureTextWidth,
      xLabel,
      yLabel,
      hasXAxis,
      hasYAxis,
      width,
    ],
  );

  const measuredHeight = typeof height === "number" ? height : null;
  const canGroupRemainingValues =
    Boolean(trimData) && shouldGroupRemainingValues !== false;
  const shouldShowAllRows = !canGroupRemainingValues;

  const chartHeight = useMemo(() => {
    if (!isMeasured || measuredHeight == null) {
      return measuredHeight;
    }

    if (!shouldShowAllRows) {
      return measuredHeight;
    }

    const valueSeriesCount = Math.max(multipleSeries.length, 1);
    const singleValueHeight =
      stackOffset != null ? MIN_BAR_HEIGHT : MIN_BAR_HEIGHT * valueSeriesCount;
    const desiredInnerHeight = trimmedDataLength * singleValueHeight;
    const desiredChartHeight = desiredInnerHeight + margin.top + margin.bottom;

    return Math.max(measuredHeight, desiredChartHeight);
  }, [
    isMeasured,
    margin,
    measuredHeight,
    multipleSeries.length,
    shouldGroupRemainingValues,
    stackOffset,
    trimmedDataLength,
    trimData,
  ]);

  const innerWidth = isMeasured ? width - margin.left - margin.right : 0;
  const resolvedHeight = isMeasured ? chartHeight ?? measuredHeight ?? 0 : 0;
  const innerHeight = isMeasured
    ? Math.max(resolvedHeight - margin.top - margin.bottom, 0)
    : 0;

  const additionalXValues = useMemo(
    () => (goal != null ? [goal.value ?? 0] : []),
    [goal],
  );

  const { xScale, yScale } = useMemo(
    () =>
      getChartScales(
        seriesData,
        innerHeight,
        innerWidth,
        additionalXValues,
        xScaleType,
        stackOffset,
        xValueRange,
      ),
    [
      additionalXValues,
      innerHeight,
      innerWidth,
      seriesData,
      stackOffset,
      xScaleType,
      xValueRange,
    ],
  );

  const paddedXScale = useMemo(
    () =>
      addSideSpacingForTicksAndLabels(
        xScale,
        measureTextWidth,
        theme.axis.ticks,
        xTickFormatter,
        theme.dataLabels,
        labelsFormatter,
        (labelledSeries ?? []).length > 0,
      ),
    [
      labelsFormatter,
      measureTextWidth,
      labelledSeries,
      theme.axis.ticks,
      theme.dataLabels,
      xScale,
      xTickFormatter,
    ],
  );

  const xTicks = useMemo(
    () =>
      getXTicks(
        theme.axis.ticks,
        innerWidth,
        paddedXScale,
        xTickFormatter,
        measureTextWidth,
        xScaleType,
      ),
    [
      innerWidth,
      measureTextWidth,
      theme.axis.ticks,
      paddedXScale,
      xScaleType,
      xTickFormatter,
    ],
  );

  const rowChartGoal = useMemo(
    () => getRowChartGoal(goal, theme.goal, measureTextWidth, paddedXScale),
    [goal, measureTextWidth, theme.goal, paddedXScale],
  );

  const chartStyle = useMemo(() => {
    if (chartHeight == null) {
      return style;
    }

    return {
      ...style,
      height: chartHeight,
    };
  }, [chartHeight, style]);

  const viewHeight = chartHeight ?? height;

  return (
    <RowChartView
      style={chartStyle}
      isStacked={stackOffset != null}
      seriesData={seriesData}
      innerHeight={innerHeight}
      innerWidth={innerWidth}
      margin={margin}
      theme={theme}
      width={width}
      height={viewHeight}
      xScale={paddedXScale}
      yScale={yScale}
      goal={rowChartGoal}
      hoveredData={hoveredData}
      yTickFormatter={yTickFormatter}
      xTickFormatter={xTickFormatter}
      labelsFormatter={labelsFormatter}
      xTicks={xTicks}
      labelledSeries={labelledSeries}
      yLabel={yLabel}
      xLabel={xLabel}
      hasXAxis={hasXAxis}
      hasYAxis={hasYAxis}
      measureTextWidth={measureTextWidth}
      onClick={onClick}
      onHover={onHover}
    />
  );
};
