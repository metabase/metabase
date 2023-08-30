import { useMemo } from "react";

import type { NumberValue } from "d3-scale";

import type { TextWidthMeasurer } from "metabase/visualizations/shared/types/measure-text";
import type { ChartTicksFormatters } from "metabase/visualizations/shared/types/format";
import type { HoveredData } from "metabase/visualizations/shared/types/events";
import type { RowChartViewProps } from "../RowChartView/RowChartView";
import RowChartView from "../RowChartView/RowChartView";
import type { ChartGoal } from "../../types/settings";
import type { ContinuousScaleType, Range } from "../../types/scale";
import {
  getMaxYValuesCount,
  getChartMargin,
  getRowChartGoal,
} from "./utils/layout";
import { getXTicks } from "./utils/ticks";
import type { RowChartTheme, Series, StackOffset } from "./types";
import { calculateNonStackedBars, calculateStackedBars } from "./utils/data";
import { addSideSpacingForTicksAndLabels, getChartScales } from "./utils/scale";

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
  measureTextWidth: TextWidthMeasurer;

  xScaleType?: ContinuousScaleType;

  style?: React.CSSProperties;

  hoveredData?: HoveredData | null;
  onClick?: RowChartViewProps<TDatum>["onClick"];
  onHover?: RowChartViewProps<TDatum>["onHover"];
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

  measureTextWidth,

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

  const trimmedData = useMemo(
    () => trimData?.(data, maxYValues) ?? data,
    [data, maxYValues, trimData],
  );

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
    ],
  );

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

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
      xValueRange
        ? xScale
        : addSideSpacingForTicksAndLabels(
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
