import type { ScaleContinuousNumeric } from "d3-scale";

import type { Margin } from "metabase/visualizations/shared/types/layout";
import type { TextWidthMeasurer } from "metabase/visualizations/shared/types/measure-text";
import type { ChartGoal } from "metabase/visualizations/shared/types/settings";
import type {
  ChartFont,
  GoalStyle,
} from "metabase/visualizations/shared/types/style";

import { LABEL_PADDING } from "../constants";
import type { SeriesData } from "../types";

const CHART_PADDING = 10;
const TICKS_OFFSET = 10;
const GOAL_LINE_PADDING = 14;

export const getMaxWidth = (
  formattedYTicks: string[],
  ticksFont: ChartFont,
  measureTextWidth: TextWidthMeasurer,
): number => {
  return Math.max(
    ...formattedYTicks.map((tick) =>
      measureTextWidth(tick, {
        size: `${ticksFont.size}px`,
        family: "Lato",
        weight: String(ticksFont.weight ?? 400),
      }),
    ),
  );
};

export const getChartMargin = <TDatum>(
  seriesData: SeriesData<TDatum>[],
  yTickFormatter: (value: any) => string,
  ticksFont: ChartFont,
  labelFont: ChartFont,
  hasGoalLine: boolean,
  measureTextWidth: TextWidthMeasurer,
  xLabel?: string | null,
  yLabel?: string | null,
  hasXAxis?: boolean,
  hasYAxis?: boolean,
  chartWidth?: number | null,
): Margin => {
  const maxYAxisLabelWidth = hasYAxis
    ? getMaxWidth(
        seriesData.flatMap((seriesData) =>
          seriesData.bars.map((bar) => yTickFormatter(bar.yValue)),
        ),
        ticksFont,
        measureTextWidth,
      )
    : 0;

  // Limit y-axis labels to 50% of chart width to ensure bars remain visible
  const maxAllowedYAxisWidth = chartWidth ? chartWidth * 0.5 : Infinity;
  const yAxisOffset = hasYAxis
    ? Math.min(maxYAxisLabelWidth, maxAllowedYAxisWidth) + TICKS_OFFSET
    : 0;

  const xAxisOffset = hasXAxis ? TICKS_OFFSET + ticksFont.size : 0;

  const margin: Margin = {
    top: hasGoalLine ? GOAL_LINE_PADDING : CHART_PADDING,
    left:
      yAxisOffset +
      CHART_PADDING +
      (yLabel != null ? LABEL_PADDING + labelFont.size : 0),
    bottom:
      CHART_PADDING +
      xAxisOffset +
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

export const ellipsifyText = (
  text: string,
  maxWidth: number,
  ticksFont: ChartFont,
  measureTextWidth: TextWidthMeasurer,
): string => {
  if (maxWidth <= 0) {
    return text;
  }

  const textWidth = measureTextWidth(text, {
    size: `${ticksFont.size}px`,
    family: "Lato",
    weight: String(ticksFont.weight ?? 400),
  });

  if (textWidth <= maxWidth) {
    return text;
  }

  const ellipsis = "…";
  const ellipsisWidth = measureTextWidth(ellipsis, {
    size: `${ticksFont.size}px`,
    family: "Lato",
    weight: String(ticksFont.weight ?? 400),
  });

  const availableWidth = maxWidth - ellipsisWidth;
  if (availableWidth <= 0) {
    return ellipsis;
  }

  // Binary search to find the longest text that fits
  let left = 0;
  let right = text.length;
  let bestFit = "";

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const truncated = text.slice(0, mid);
    const truncatedWidth = measureTextWidth(truncated, {
      size: `${ticksFont.size}px`,
      family: "Lato",
      weight: String(ticksFont.weight ?? 400),
    });

    if (truncatedWidth <= availableWidth) {
      bestFit = truncated;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return bestFit + ellipsis;
};

export const getRowChartGoal = (
  goal: ChartGoal | null | undefined,
  style: GoalStyle,
  measureTextWidth: TextWidthMeasurer,
  xScale: ScaleContinuousNumeric<number, number, never>,
) => {
  if (!goal) {
    return null;
  }

  const labelWidth = measureTextWidth(goal.label, style.label);
  const goalX = xScale(goal.value);
  const xMax = xScale.range()[1];
  const availableRightSideSpace = xMax - goalX;
  const position =
    labelWidth > availableRightSideSpace
      ? ("left" as const)
      : ("right" as const);

  return {
    ...goal,
    position,
  };
};
