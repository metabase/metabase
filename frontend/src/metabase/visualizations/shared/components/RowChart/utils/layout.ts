import type { ScaleContinuousNumeric } from "d3-scale";
import { TextMeasurer } from "metabase/visualizations/shared/types/measure-text";
import { Margin } from "metabase/visualizations/shared/types/layout";
import {
  ChartFont,
  GoalStyle,
} from "metabase/visualizations/shared/types/style";
import { ChartGoal } from "metabase/visualizations/shared/types/settings";
import { LABEL_PADDING } from "../constants";
import { SeriesData } from "../types";

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
  seriesData: SeriesData<TDatum>[],
  yTickFormatter: (value: any) => string,
  ticksFont: ChartFont,
  labelFont: ChartFont,
  hasGoalLine: boolean,
  measureText: TextMeasurer,
  xLabel?: string | null,
  yLabel?: string | null,
  hasXAxis?: boolean,
  hasYAxis?: boolean,
): Margin => {
  const yAxisOffset = hasYAxis
    ? getMaxWidth(
        seriesData.flatMap(seriesData =>
          seriesData.bars.map(bar => yTickFormatter(bar.yValue)),
        ),
        ticksFont,
        measureText,
      ) + TICKS_OFFSET
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

export const getRowChartGoal = (
  goal: ChartGoal | null | undefined,
  style: GoalStyle,
  measureText: TextMeasurer,
  xScale: ScaleContinuousNumeric<number, number, never>,
) => {
  if (!goal) {
    return null;
  }

  const labelWidth = measureText(goal.label, style.label);
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
