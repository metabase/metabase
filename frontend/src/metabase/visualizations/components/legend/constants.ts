import { CHART_STYLE } from "metabase/viz-core";

// DashCardVisualization measures the caption title with these, so they must match how LegendCaption renders it
export const LEGEND_LABEL_FONT_SIZE = "0.875rem";
export const LEGEND_LABEL_FONT_WEIGHT = 700;
// room for the focus outline of the legend items
export const LEGEND_PADDING = 2;
export const MIN_VISIBLE_COUNT = 1;
// a column's first item lines up with the top of the plot
export const LEGEND_COLUMN_MARGIN_TOP = CHART_STYLE.padding.y - LEGEND_PADDING;
