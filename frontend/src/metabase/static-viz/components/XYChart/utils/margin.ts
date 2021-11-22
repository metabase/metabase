import { measureTextHeight } from "metabase/static-viz/lib/text";
import { CHART_PADDING } from "../constants";
import { ChartSettings } from "../types";

const LABEL_OFFSET = 10;

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
) => {
  return {
    top: CHART_PADDING,
    left: calculateSideMargin(leftYTickWidth, labelFontSize, labels.left),
    right: calculateSideMargin(rightYTickWidth, labelFontSize, labels.right),
    bottom: calculateSideMargin(xTickHeight, labelFontSize, labels.bottom),
  };
};
