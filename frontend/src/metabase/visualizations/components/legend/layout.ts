import { c } from "ttag";
import _ from "underscore";

import type { TextWidthMeasurer } from "metabase/utils/measure-text";
import type { LegendPosition } from "metabase-types/api";

import type { LegendItemData } from "./LegendItem";
import { LEGEND_PLACEMENTS } from "./placement";

export type LegendSize = "sm" | "lg" | "md";

interface LegendSizeConfig {
  typography: "sm" | "md";
  fontSize: number;
  lineHeight: number;
  dotSize: number;
  dotGap: number;
  itemGap: number;
  rowGap: number;
  horizontalGap: number;
  verticalGap: number;
  maxVerticalWidth: number;
  horizontalPadding: number;
  verticalPadding: number;
}

export const LEGEND_SIZES = {
  sm: {
    typography: "sm",
    fontSize: 12,
    lineHeight: 1.15,
    dotSize: 8,
    dotGap: 6,
    itemGap: 12,
    rowGap: 8,
    horizontalGap: 12,
    verticalGap: 24,
    maxVerticalWidth: 200,
    horizontalPadding: 32,
    verticalPadding: 16,
  },
  lg: {
    typography: "sm",
    fontSize: 12,
    lineHeight: 1.15,
    dotSize: 8,
    dotGap: 6,
    itemGap: 12,
    rowGap: 12,
    horizontalGap: 16,
    verticalGap: 40,
    maxVerticalWidth: 200,
    horizontalPadding: 80,
    verticalPadding: 76,
  },
  md: {
    typography: "md",
    fontSize: 14,
    lineHeight: 1.22,
    dotSize: 14,
    dotGap: 8,
    itemGap: 16,
    rowGap: 16,
    horizontalGap: 24,
    verticalGap: 64,
    maxVerticalWidth: 256,
    horizontalPadding: 48,
    verticalPadding: 32,
  },
} as const satisfies Record<LegendSize, LegendSizeConfig>;

// mirrors the large card tier in visualizations/CartesianChart/sizing.ts
const LARGE_CARD_MIN_WIDTH = 640;
const LARGE_CARD_MIN_HEIGHT = 360;

interface GetLegendSizeOptions {
  width: number;
  height: number;
  isQueryBuilder?: boolean;
  isFullscreen?: boolean;
}

export const getLegendSize = ({
  width,
  height,
  isQueryBuilder,
  isFullscreen,
}: GetLegendSizeOptions): LegendSize => {
  if (isQueryBuilder || isFullscreen) {
    return "md";
  }
  return width >= LARGE_CARD_MIN_WIDTH && height >= LARGE_CARD_MIN_HEIGHT
    ? "lg"
    : "sm";
};

export const LEGEND_FONT_WEIGHT = 400;
// room for the focus outline of the legend items
export const LEGEND_PADDING = 2;
export const MIN_LEGEND_CARD_WIDTH = 420;
const MAX_VERTICAL_WIDTH_RATIO = 0.25;
const MAX_TRUNCATED_ITEMS_RATIO = 0.5;
export const MIN_VISIBLE_COUNT = 1;
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

export interface ChartSize {
  width: number;
  height: number;
}

/** The plot a chart keeps inside its axes at one size. */
export interface Plot extends ChartSize {
  hasXAxisLabels: boolean;
  // the left axes' width minus the right axes'
  indent: number;
}

/** One value for each option Auto weighs: no legend, a row, or a column. */
export interface LegendCandidates<T> {
  none: T;
  row: T;
  column: T;
}

export const mapLegendCandidates = <T, U>(
  candidates: LegendCandidates<T>,
  transform: (value: T) => U,
): LegendCandidates<U> => ({
  none: transform(candidates.none),
  row: transform(candidates.row),
  column: transform(candidates.column),
});

export interface MeasureLegendOptions {
  items: LegendItemData[];
  width: number;
  height: number;
  // the room the chart shares with its legend, the same whichever legend shows
  chartRoom?: ChartSize;
  size: LegendSize;
  fontFamily: string;
  measureText: TextWidthMeasurer;
  isReversed?: boolean;
}

export interface LegendMetrics {
  config: LegendSizeConfig;
  width: number;
  height: number;
  chartSizes: LegendCandidates<ChartSize>;
  labelWidths: number[];
  itemWidths: number[];
  availableWidth: number;
  // 0 when no item fits, while a column always shows columnVisibleCount
  columnFitCount: number;
  columnVisibleCount: number;
  columnWidth: number;
  measureOverflowLabel: (overflowCount: number) => number;
}

interface GetLegendLayoutOptions {
  position: LegendPosition;
  plots: LegendCandidates<Plot>;
  alwaysVisible?: boolean;
}

export const getOverflowLabel = (count: number) =>
  c("{0} is the number of hidden legend items").t`+ ${count} more`;

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

// Auto weighs each legend by the plot it leaves. A complete row below the
// chart wins unless a right column leaves the plot clearly more usable height,
// as on wide short cards. A partial row with "+ N more" comes last. A legend
// that hides x-axis labels the bare chart shows, or leaves the plot under
// MIN_AUTO_LEGEND_PLOT_RATIO of its bare height, is not an option.
// A column with most labels truncated needs a card MIN_LEGEND_CARD_WIDTH wide.
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

const getRowHeight = (config: LegendSizeConfig) =>
  config.fontSize * config.lineHeight +
  config.horizontalGap +
  LEGEND_PADDING * 2;

function isColumnMostlyTruncated(metrics: LegendMetrics): boolean {
  const labelWidth = getColumnItemWidth(metrics) - getDotWidth(metrics.config);
  const truncatedCount = metrics.labelWidths.filter(
    (width) => width > labelWidth,
  ).length;
  return (
    truncatedCount > metrics.labelWidths.length * MAX_TRUNCATED_ITEMS_RATIO
  );
}

export function measureLegend({
  items,
  width,
  height,
  chartRoom: measuredChartRoom,
  size,
  fontFamily,
  measureText,
  isReversed,
}: MeasureLegendOptions): LegendMetrics {
  const config = LEGEND_SIZES[size];
  const font = {
    size: config.fontSize,
    weight: LEGEND_FONT_WEIGHT,
    family: fontFamily,
  };
  const displayedItems = isReversed ? [...items].reverse() : items;
  const labelWidths = displayedItems.map((item) =>
    measureText(item.name, font),
  );
  const dotWidth = getDotWidth(config);
  const availableWidth = width - config.horizontalPadding;
  const chartRoom = measuredChartRoom ?? {
    width,
    height: height - config.verticalPadding,
  };
  const itemWidths = labelWidths.map((labelWidth) => dotWidth + labelWidth);
  const measureOverflowLabel = (overflowCount: number) =>
    measureText(getOverflowLabel(overflowCount), font);
  const columnFitCount = getColumnFitCount(
    { itemWidths, config },
    chartRoom.height,
  );
  const columnVisibleCount = Math.max(columnFitCount, MIN_VISIBLE_COUNT);
  const columnWidth = getColumnWidth(
    { itemWidths, config, availableWidth, measureOverflowLabel },
    columnVisibleCount,
  );

  return {
    config,
    width,
    height,
    chartSizes: {
      none: chartRoom,
      row: {
        width: chartRoom.width,
        height: Math.max(chartRoom.height - getRowHeight(config), 0),
      },
      column: {
        width: Math.max(chartRoom.width - columnWidth - config.verticalGap, 0),
        height: chartRoom.height,
      },
    },
    labelWidths,
    itemWidths,
    availableWidth,
    columnFitCount,
    columnVisibleCount,
    columnWidth,
    measureOverflowLabel,
  };
}

const getDotWidth = (config: LegendSizeConfig) =>
  config.dotSize + config.dotGap;

const getRowWidth = (itemWidths: number[], config: LegendSizeConfig) =>
  itemWidths.reduce((total, width) => total + width, 0) +
  config.itemGap * (itemWidths.length - 1);

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

const getColumnItemWidth = ({
  itemWidths,
  config,
  availableWidth,
}: Pick<LegendMetrics, "itemWidths" | "config" | "availableWidth">) =>
  Math.max(
    0,
    Math.min(
      Math.max(...itemWidths),
      availableWidth * MAX_VERTICAL_WIDTH_RATIO,
      config.maxVerticalWidth,
    ),
  );

function getColumnFitCount(
  { itemWidths, config }: Pick<LegendMetrics, "itemWidths" | "config">,
  columnHeight: number,
): number {
  const rowPitch = config.fontSize * config.lineHeight + config.rowGap;
  const getMaxRows = (rowsHeight: number) =>
    Math.floor((rowsHeight + config.rowGap) / rowPitch);
  if (itemWidths.length <= getMaxRows(columnHeight - LEGEND_PADDING * 2)) {
    return itemWidths.length;
  }
  // the last row is the "+ N more" label, which takes no focus outline
  return Math.max(getMaxRows(columnHeight - LEGEND_PADDING) - 1, 0);
}

function getColumnWidth(
  metrics: Pick<
    LegendMetrics,
    "itemWidths" | "config" | "availableWidth" | "measureOverflowLabel"
  >,
  visibleCount: number,
): number {
  const overflowCount = metrics.itemWidths.length - visibleCount;
  const overflowLabelWidth =
    overflowCount > 0 ? metrics.measureOverflowLabel(overflowCount) : 0;
  const contentWidth = Math.max(
    getColumnItemWidth(metrics),
    Math.min(overflowLabelWidth, metrics.config.maxVerticalWidth),
  );
  return Math.ceil(contentWidth) + LEGEND_PADDING * 2;
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
  if (!allowMostlyTruncated && isColumnMostlyTruncated(metrics)) {
    return HIDDEN_LEGEND_LAYOUT;
  }

  return {
    type: "vertical",
    isBeforeChart,
    width: columnWidth,
    visibleCount: columnVisibleCount,
  };
}
