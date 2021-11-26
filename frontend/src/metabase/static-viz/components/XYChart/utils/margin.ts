import { measureTextHeight } from "metabase/static-viz/lib/text";
import { CHART_PADDING } from "metabase/static-viz/components/XYChart/constants";
import { ChartSettings } from "metabase/static-viz/components/XYChart/types";

export const LABEL_OFFSET = 10;
export const GOAL_MARGIN = 6;

const calculateSideMargin = (
  tickSpace: number,
  labelFontSize: number,
  label?: string,
) => {
  let margin = CHART_PADDING + tickSpace;

  if (label) {
    margin += measureTextHeight(labelFontSize) + LABEL_OFFSET;
  }

  return margin;
};

export const calculateMargin = (
  leftYTickWidth: number,
  rightYTickWidth: number,
  xTickHeight: number,
  labels: ChartSettings["labels"],
  labelFontSize: number,
  hasGoalLine?: boolean,
) => {
  return {
    top: hasGoalLine ? GOAL_MARGIN + CHART_PADDING : CHART_PADDING,
    left: calculateSideMargin(leftYTickWidth, labelFontSize, labels.left),
    right: calculateSideMargin(rightYTickWidth, labelFontSize, labels.right),
    bottom: calculateSideMargin(xTickHeight, labelFontSize, labels.bottom),
  };
};
