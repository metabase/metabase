import _ from "underscore";

import type { Padding } from "metabase/viz-core";
import type { LegendPosition } from "metabase-types/api";

import { LEGEND_PADDING, MIN_VISIBLE_COUNT } from "./constants";
import { type LegendMetrics, getRowWidth } from "./measure";
import { LEGEND_PLACEMENTS, type LegendPlacement } from "./placement";
import type { ChartSize, LegendCandidates, Plot } from "./plots";
import { LEGEND_SIZES, type LegendSizeTier } from "./sizes";

export const MIN_LEGEND_CARD_WIDTH = 420;
const AUTO_MIN_VISIBLE_COUNT = 2;
// the plot is the chart without its axes, as in PLOT_HEIGHT_BREAKPOINTS
const MIN_PLOT_WIDTH = 150;
// A plot wider than this many times its height gains little from more width,
// so Auto measures a plot by the height it can use.
const PLOT_ASPECT_RATIO = 3;
// Auto keeps a bottom row unless a column leaves the plot a third more height.
const MIN_AUTO_ROW_TO_COLUMN_PLOT_RATIO = 0.75;
// Auto hides a legend that leaves the plot under this share of the bare chart's.
const MIN_AUTO_LEGEND_PLOT_RATIO = 0.6;
const MIN_COLUMN_CARD_HEIGHT = 100;

export type LegendLayoutResult =
  | { type: "hidden" }
  | {
      type: "horizontal";
      isBeforeChart: boolean;
      // the plot's indent, which the row lines up with, or 0 for a full-width row
      indent: number;
      visibleCount: number;
    }
  | {
      type: "vertical";
      isBeforeChart: boolean;
      width: number;
      visibleCount: number;
    };

export const HIDDEN_LEGEND_LAYOUT: LegendLayoutResult = { type: "hidden" };

interface GetLegendLayoutOptions {
  position: LegendPosition;
  plots: LegendCandidates<Plot>;
  alwaysVisible?: boolean;
}

export function getLegendLayout(
  metrics: LegendMetrics,
  { position, plots, alwaysVisible = false }: GetLegendLayoutOptions,
): LegendLayoutResult {
  if (metrics.itemWidths.length === 0 || position === "off") {
    return HIDDEN_LEGEND_LAYOUT;
  }
  if (position === "auto") {
    return getAutoLayout(metrics, plots, alwaysVisible);
  }
  const { orientation, isBeforeChart } = LEGEND_PLACEMENTS[position];
  const fit = {
    isBeforeChart,
    minVisibleCount: MIN_VISIBLE_COUNT,
    alwaysVisible,
  };
  return orientation === "horizontal"
    ? getRowLayout(metrics, plots.row, fit)
    : getColumnLayout(metrics, plots.column, {
        ...fit,
        allowMostlyTruncated: true,
      });
}

/**
 * Auto weighs each legend by the plot it leaves. A complete row below the
 * chart wins unless a right column leaves the plot clearly more usable height,
 * as on wide short cards. A partial row with "+ N more" comes last.
 *
 * A legend that hides x-axis labels the bare chart shows, or leaves the plot
 * under MIN_AUTO_LEGEND_PLOT_RATIO of its bare height, is not an option. A
 * column with most labels truncated needs a card MIN_LEGEND_CARD_WIDTH wide.
 */
function getAutoLayout(
  metrics: LegendMetrics,
  plots: LegendCandidates<Plot>,
  alwaysVisible: boolean,
): LegendLayoutResult {
  const itemCount = metrics.itemWidths.length;
  const fit = {
    isBeforeChart: false,
    minVisibleCount: alwaysVisible ? MIN_VISIBLE_COUNT : AUTO_MIN_VISIBLE_COUNT,
    alwaysVisible,
  };
  const row = getRowLayout(metrics, plots.row, fit);
  const column = getColumnLayout(metrics, plots.column, {
    ...fit,
    allowMostlyTruncated:
      alwaysVisible || metrics.width >= MIN_LEGEND_CARD_WIDTH,
  });
  const isRowComplete = row.type !== "hidden" && row.visibleCount === itemCount;
  if (alwaysVisible) {
    return isRowComplete || column.type === "hidden" ? row : column;
  }

  const rowHeight =
    row.type === "hidden" ? null : getAutoPlotHeight(plots.row, plots.none);
  const columnHeight =
    column.type === "hidden"
      ? null
      : getAutoPlotHeight(plots.column, plots.none);
  if (rowHeight === null) {
    return columnHeight === null ? HIDDEN_LEGEND_LAYOUT : column;
  }
  if (columnHeight === null) {
    return row;
  }
  const isRowPreferred =
    isRowComplete &&
    rowHeight >= columnHeight * MIN_AUTO_ROW_TO_COLUMN_PLOT_RATIO;
  return isRowPreferred ? row : column;
}

const getUsablePlotHeight = ({ width, height }: ChartSize) =>
  Math.max(Math.min(height, width / PLOT_ASPECT_RATIO), 0);

// the usable plot height a legend leaves, or null when Auto must not show it
function getAutoPlotHeight(plot: Plot, barePlot: Plot): number | null {
  const keepsXAxisLabels = plot.hasXAxisLabels || !barePlot.hasXAxisLabels;
  const plotHeight = getUsablePlotHeight(plot);
  const isWorthShowing =
    keepsXAxisLabels &&
    plotHeight >= getUsablePlotHeight(barePlot) * MIN_AUTO_LEGEND_PLOT_RATIO;
  return isWorthShowing ? plotHeight : null;
}

interface LegendFit {
  isBeforeChart: boolean;
  minVisibleCount: number;
  alwaysVisible: boolean;
}

function getRowLayout(
  metrics: LegendMetrics,
  plot: Plot,
  { isBeforeChart, minVisibleCount, alwaysVisible }: LegendFit,
): LegendLayoutResult {
  const { config, itemWidths, availableWidth } = metrics;
  if (plot.width < MIN_PLOT_WIDTH && !alwaysVisible) {
    return HIDDEN_LEGEND_LAYOUT;
  }
  const rowWidthInsideIndent =
    availableWidth - Math.abs(plot.indent) - LEGEND_PADDING * 2;
  const visibleCount = getRowVisibleCount(metrics, rowWidthInsideIndent);
  // a row that only fits across the y-axis indent starts at the card edge, as on x.64
  const isIndented =
    visibleCount === itemWidths.length ||
    getRowWidth(itemWidths, config) > availableWidth - LEGEND_PADDING * 2;
  if (
    isIndented &&
    visibleCount < Math.min(minVisibleCount, itemWidths.length)
  ) {
    return HIDDEN_LEGEND_LAYOUT;
  }
  return {
    type: "horizontal",
    isBeforeChart,
    indent: isIndented ? plot.indent : 0,
    visibleCount: isIndented ? visibleCount : itemWidths.length,
  };
}

function getRowVisibleCount(
  { itemWidths, config, measureOverflowLabel }: LegendMetrics,
  rowWidthInsideIndent: number,
): number {
  if (getRowWidth(itemWidths, config) <= rowWidthInsideIndent) {
    return itemWidths.length;
  }

  const fitsWithOverflowLabel = (visibleCount: number) =>
    getRowWidth(itemWidths.slice(0, visibleCount), config) +
      config.itemGap +
      measureOverflowLabel(itemWidths.length - visibleCount) <=
    rowWidthInsideIndent;

  return (
    _.range(itemWidths.length - 1, MIN_VISIBLE_COUNT, -1).find(
      fitsWithOverflowLabel,
    ) ?? MIN_VISIBLE_COUNT
  );
}

function getColumnLayout(
  metrics: LegendMetrics,
  plot: Plot,
  {
    isBeforeChart,
    minVisibleCount,
    alwaysVisible,
    allowMostlyTruncated,
  }: LegendFit & { allowMostlyTruncated: boolean },
): LegendLayoutResult {
  const {
    height,
    itemWidths,
    columnFitCount,
    columnVisibleCount,
    columnWidth,
  } = metrics;
  const hasRoom =
    plot.width >= MIN_PLOT_WIDTH &&
    height >= MIN_COLUMN_CARD_HEIGHT &&
    columnFitCount >= Math.min(minVisibleCount, itemWidths.length);
  if (!alwaysVisible && !hasRoom) {
    return HIDDEN_LEGEND_LAYOUT;
  }
  if (!allowMostlyTruncated && metrics.isColumnMostlyTruncated) {
    return HIDDEN_LEGEND_LAYOUT;
  }

  return {
    type: "vertical",
    isBeforeChart,
    width: columnWidth,
    visibleCount: columnVisibleCount,
  };
}

export const MIN_CHART_SIDE_MARGIN = 12;

const NO_MARGINS: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * The legend's margins at `placement`. The side facing the chart discounts the
 * chart's internal inset on that same side, so the gap to the chart content
 * stays constant.
 */
export const getLegendMargins = (
  size: LegendSizeTier,
  placement: LegendPlacement,
  internalInset: Pick<Padding, "left" | "right">,
): Padding => {
  const { chartSide } = LEGEND_PLACEMENTS[placement];
  const margins: Padding = {
    ...NO_MARGINS,
    ...LEGEND_SIZES[size].contentMargin[`${placement}Legend`],
  };
  if (placement === "left" || placement === "right") {
    margins[chartSide] = Math.max(
      margins[chartSide] - internalInset[placement],
      MIN_CHART_SIDE_MARGIN,
    );
  }
  return margins;
};

export const getLayoutPlacement = (
  layout: Exclude<LegendLayoutResult, { type: "hidden" }>,
): LegendPlacement => {
  if (layout.type === "horizontal") {
    return layout.isBeforeChart ? "top" : "bottom";
  }
  return layout.isBeforeChart ? "left" : "right";
};
