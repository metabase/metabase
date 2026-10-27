import { CHART_STYLE } from "metabase/viz-core";

// room for the focus outline of the legend items
export const LEGEND_PADDING = 2;
export const MIN_VISIBLE_COUNT = 1;
// the horizontal space between a left or right legend and the chart
export const LEGEND_COLUMN_GAP = 24;
// a column's first item lines up with the top of a plot without value labels
export const LEGEND_COLUMN_MARGIN_TOP = CHART_STYLE.padding.y - LEGEND_PADDING;
