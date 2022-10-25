import React, { useMemo } from "react";

import _ from "underscore";
import type { NumberValue } from "d3-scale";

import { TextMeasurer } from "metabase/visualizations/shared/types/measure-text";
import { ChartTicksFormatters } from "metabase/visualizations/shared/types/format";
import { HoveredData } from "metabase/visualizations/shared/types/events";
import RowChartView, { RowChartViewProps } from "../RowChartView/RowChartView";
import { ChartGoal } from "../../types/settings";
import { ContinuousScaleType, Range } from "../../types/scale";
import {
  getMaxYValuesCount,
  getChartMargin,
  getRowChartGoal,
} from "./utils/layout";
import { getXTicks } from "./utils/ticks";
import { RowChartTheme, Series, StackOffset } from "./types";
import { calculateNonStackedBars, calculateStackedBars } from "./utils/data";
import { addSideSpacingForTicksAndLabels } from "./utils/scale";

const MIN_BAR_HEIGHT = 24;

const defaultFormatter = (value: any) => String(value);

export interface RowChartProps<TDatum> {
  width: number;
  height: number;

  data: TDatum[];
  series: Series<TDatum>[];
  seriesColors: Record<string, string>;

  trimData?: (data: TDatum[], maxLength: number) => TDatum[];

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
  measureText: TextMeasurer;

  xScaleType?: ContinuousScaleType;

  style?: React.CSSProperties;

  hoveredData?: HoveredData | null;
  onClick?: RowChartViewProps["onClick"];
  onHover?: RowChartViewProps["onHover"];
}

export const RowChart = <TDatum,>({
  width,
  height,

  data,
  trimData,
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

  measureText,

  style,

  hoveredData,
  onClick,
  onHover,
}: RowChartProps<TDatum>) => {
  const maxYValues = useMemo(
    () =>
      getMaxYValuesCount(
        height,
        MIN_BAR_HEIGHT,
        stackOffset != null,
        multipleSeries.length,
      ),
    [height, multipleSeries.length, stackOffset],
  );

  const trimmedData = trimData?.(data, maxYValues) ?? data;

  const { xTickFormatter, yTickFormatter } = tickFormatters;

  const margin = useMemo(
    () =>
      getChartMargin(
        trimmedData,
        multipleSeries,
        yTickFormatter,
        theme.axis.ticks,
        theme.axis.label,
        goal != null,
        measureText,
        xLabel,
        yLabel,
        hasXAxis,
        hasYAxis,
      ),
    [
      trimmedData,
      multipleSeries,
      yTickFormatter,
      theme.axis.ticks,
      theme.axis.label,
      goal,
      measureText,
      xLabel,
      yLabel,
      hasXAxis,
      hasYAxis,
    ],
  );

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const additionalXValues = useMemo(
    () => (goal != null ? [goal.value ?? 0] : []),
    [goal],
  );

  const { xScale, yScale, xDomain, seriesData } = useMemo(
    () =>
      stackOffset != null
        ? calculateStackedBars<TDatum>({
            data: trimmedData,
            multipleSeries,
            additionalXValues,
            stackOffset,
            innerWidth,
            innerHeight,
            seriesColors,
            xScaleType,
            xValueRange,
          })
        : calculateNonStackedBars<TDatum>({
            data: trimmedData,
            multipleSeries,
            additionalXValues,
            innerWidth,
            innerHeight,
            seriesColors,
            xScaleType,
            xValueRange,
          }),
    [
      additionalXValues,
      innerHeight,
      innerWidth,
      multipleSeries,
      seriesColors,
      stackOffset,
      trimmedData,
      xScaleType,
      xValueRange,
    ],
  );

  const paddedXScale = useMemo(
    () =>
      xValueRange
        ? xScale
        : addSideSpacingForTicksAndLabels(
            xScale,
            xDomain,
            measureText,
            theme.axis.ticks,
            xTickFormatter,
            theme.dataLabels,
            labelsFormatter,
            (labelledSeries ?? []).length > 0,
          ),
    [
      labelsFormatter,
      measureText,
      labelledSeries,
      theme.axis.ticks,
      theme.dataLabels,
      xDomain,
      xScale,
      xTickFormatter,
      xValueRange,
    ],
  );

  const xTicks = useMemo(
    () =>
      getXTicks(
        theme.axis.ticks,
        innerWidth,
        paddedXScale,
        xTickFormatter,
        measureText,
        xScaleType,
      ),
    [
      innerWidth,
      measureText,
      theme.axis.ticks,
      paddedXScale,
      xScaleType,
      xTickFormatter,
    ],
  );

  const rowChartGoal = useMemo(
    () => getRowChartGoal(goal, theme.goal, measureText, paddedXScale),
    [goal, measureText, theme.goal, paddedXScale],
  );

  return (
    <RowChartView
      style={style}
      isStacked={stackOffset != null}
      seriesData={seriesData}
      innerHeight={innerHeight}
      innerWidth={innerWidth}
      margin={margin}
      theme={theme}
      width={width}
      height={height}
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
      onClick={onClick}
      onHover={onHover}
    />
  );
};
