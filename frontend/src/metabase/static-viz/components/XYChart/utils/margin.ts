import { CHART_PADDING } from "metabase/static-viz/components/XYChart/constants";
import type { ChartSettings } from "metabase/static-viz/components/XYChart/types";
import { measureTextHeight } from "metabase/static-viz/lib/text";

export const LABEL_OFFSET = 12;
export const MARGIN = 6;

const calculateSideMargin = (
  tickSpace: number,
  labelFontSize: number,
  minMargin: number,
  label?: string,
) => {
  let margin = CHART_PADDING + tickSpace;

  if (label) {
    margin += measureTextHeight(labelFontSize) + LABEL_OFFSET;
  }

  return Math.max(margin, minMargin);
};

export const calculateMargin = (
  leftYTickWidth: number,
  rightYTickWidth: number,
  xTickHeight: number,
  xTickWidth: number,
  labels: ChartSettings["labels"],
  labelFontSize: number,
  hasTopMargin?: boolean,
) => {
  const minHorizontalMargin = xTickWidth / 2;

  return {
    top: hasTopMargin ? MARGIN + CHART_PADDING : CHART_PADDING,
    left: calculateSideMargin(
      leftYTickWidth,
      labelFontSize,
      minHorizontalMargin,
      labels.left,
    ),
    right: calculateSideMargin(
      rightYTickWidth,
      labelFontSize,
      minHorizontalMargin,
      labels.right,
    ),
    bottom: calculateSideMargin(xTickHeight, labelFontSize, 0, labels.bottom),
  };
};
