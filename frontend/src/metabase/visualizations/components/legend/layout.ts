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
export const MIN_LEGEND_CARD_HEIGHT = 200;
const MAX_VERTICAL_WIDTH_RATIO = 0.25;
const MAX_TRUNCATED_ITEMS_RATIO = 0.5;
export const MIN_VISIBLE_COUNT = 1;
const AUTO_MIN_VISIBLE_COUNT = 2;
// the plot is the chart without its axes, as in PLOT_HEIGHT_BREAKPOINTS
const MIN_PLOT_WIDTH = 150;
const MIN_PLOT_HEIGHT = 80;
const MIN_COLUMN_CARD_HEIGHT = 100;

export type LegendLayoutResult =
  | { type: "hidden" }
  | {
      type: "horizontal";
      isBeforeChart: boolean;
      isIndented: boolean;
      visibleCount: number;
    }
  | {
      type: "vertical";
      isBeforeChart: boolean;
      width: number;
      visibleCount: number;
    };

export const HIDDEN_LEGEND_LAYOUT: LegendLayoutResult = { type: "hidden" };

export interface PlotInset {
  width: number;
  height: number;
}

const NO_PLOT_INSET: PlotInset = { width: 0, height: 0 };

interface GetLegendLayoutOptions {
  items: LegendItemData[];
  plotInset?: PlotInset;
  position: LegendPosition;
  width: number;
  height: number;
  chartHeight?: number;
  horizontalWidth?: number;
  size: LegendSize;
  fontFamily: string;
  measureText: TextWidthMeasurer;
  alwaysVisible?: boolean;
  isReversed?: boolean;
}

interface LegendMetrics {
  config: LegendSizeConfig;
  width: number;
  height: number;
  plotInset: PlotInset;
  labelWidths: number[];
  itemWidths: number[];
  availableWidth: number;
  rowWidthInsideIndent: number;
  availableHeight: number;
  measureOverflowLabel: (overflowCount: number) => number;
}

export const getOverflowLabel = (count: number) =>
  c("{0} is the number of hidden legend items").t`+ ${count} more`;

export function getLegendLayout(
  options: GetLegendLayoutOptions,
): LegendLayoutResult {
  const { items, position, alwaysVisible = false } = options;
  if (items.length === 0 || position === "off") {
    return HIDDEN_LEGEND_LAYOUT;
  }

  const metrics = measureLegend(options);
  if (position === "auto") {
    return getAutoLayout(metrics, alwaysVisible);
  }
  const { orientation, isBeforeChart } = LEGEND_PLACEMENTS[position];
  const fit = {
    isBeforeChart,
    minVisibleCount: MIN_VISIBLE_COUNT,
    alwaysVisible,
  };
  return orientation === "horizontal"
    ? getRowLayout(metrics, fit)
    : getColumnLayout(metrics, { ...fit, allowMostlyTruncated: true });
}

// Auto tries a complete row at the bottom at any height, as x.64 did on top,
// then a column on the right, which x.64 drew truncated on cards as wide as
// MIN_LEGEND_CARD_WIDTH.
function getAutoLayout(
  metrics: LegendMetrics,
  alwaysVisible: boolean,
): LegendLayoutResult {
  const itemCount = metrics.itemWidths.length;
  const fit = {
    isBeforeChart: false,
    minVisibleCount: alwaysVisible ? MIN_VISIBLE_COUNT : AUTO_MIN_VISIBLE_COUNT,
    alwaysVisible,
  };
  const completeRow = getRowLayout(metrics, { ...fit, alwaysVisible: true });
  if (completeRow.type !== "hidden" && completeRow.visibleCount === itemCount) {
    return completeRow;
  }
  const column = getColumnLayout(metrics, {
    ...fit,
    allowMostlyTruncated:
      alwaysVisible || metrics.width >= MIN_LEGEND_CARD_WIDTH,
  });
  if (column.type !== "hidden") {
    return column;
  }
  return getRowLayout(metrics, fit);
}

function getRowLayout(
  metrics: LegendMetrics,
  {
    isBeforeChart,
    minVisibleCount,
    alwaysVisible,
  }: {
    isBeforeChart: boolean;
    minVisibleCount: number;
    alwaysVisible: boolean;
  },
): LegendLayoutResult {
  const { config, width, height, plotInset, itemWidths, availableWidth } =
    metrics;
  const rowHeight =
    config.fontSize * config.lineHeight +
    config.horizontalGap +
    LEGEND_PADDING * 2;
  const hasRoom =
    width - plotInset.width >= MIN_PLOT_WIDTH &&
    height - rowHeight - plotInset.height >= MIN_PLOT_HEIGHT;
  if (!hasRoom && !alwaysVisible) {
    return HIDDEN_LEGEND_LAYOUT;
  }
  const visibleCount = getRowVisibleCount(metrics);
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
    isIndented,
    visibleCount: isIndented ? visibleCount : itemWidths.length,
  };
}

function isColumnMostlyTruncated(metrics: LegendMetrics): boolean {
  const labelWidth = getColumnItemWidth(metrics) - getDotWidth(metrics.config);
  const truncatedCount = metrics.labelWidths.filter(
    (width) => width > labelWidth,
  ).length;
  return (
    truncatedCount > metrics.labelWidths.length * MAX_TRUNCATED_ITEMS_RATIO
  );
}

function measureLegend({
  items,
  width,
  height,
  chartHeight,
  horizontalWidth = width,
  size,
  fontFamily,
  measureText,
  isReversed,
  plotInset = NO_PLOT_INSET,
}: GetLegendLayoutOptions): LegendMetrics {
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

  return {
    config,
    width,
    height,
    plotInset,
    labelWidths,
    itemWidths: labelWidths.map((labelWidth) => dotWidth + labelWidth),
    availableWidth,
    rowWidthInsideIndent:
      availableWidth - (width - horizontalWidth) - LEGEND_PADDING * 2,
    availableHeight:
      (chartHeight ?? height - config.verticalPadding) - LEGEND_PADDING * 2,
    measureOverflowLabel: (overflowCount) =>
      measureText(getOverflowLabel(overflowCount), font),
  };
}

const getDotWidth = (config: LegendSizeConfig) =>
  config.dotSize + config.dotGap;

const getRowWidth = (itemWidths: number[], config: LegendSizeConfig) =>
  itemWidths.reduce((total, width) => total + width, 0) +
  config.itemGap * (itemWidths.length - 1);

function getRowVisibleCount({
  itemWidths,
  config,
  rowWidthInsideIndent,
  measureOverflowLabel,
}: LegendMetrics): number {
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
}: LegendMetrics) =>
  Math.max(
    0,
    Math.min(
      Math.max(...itemWidths),
      availableWidth * MAX_VERTICAL_WIDTH_RATIO,
      config.maxVerticalWidth,
    ),
  );

function getColumnVisibleCount(
  { itemWidths, config, availableHeight }: LegendMetrics,
  minVisibleCount: number,
): number {
  const rowPitch = config.fontSize * config.lineHeight + config.rowGap;
  const maxRows = Math.floor((availableHeight + config.rowGap) / rowPitch);
  // the last row is reserved for the "+ N more" label when items overflow
  return itemWidths.length <= maxRows
    ? itemWidths.length
    : Math.max(maxRows - 1, minVisibleCount);
}

function getColumnLayout(
  metrics: LegendMetrics,
  {
    isBeforeChart,
    minVisibleCount,
    alwaysVisible,
    allowMostlyTruncated,
  }: {
    isBeforeChart: boolean;
    minVisibleCount: number;
    alwaysVisible: boolean;
    allowMostlyTruncated: boolean;
  },
): LegendLayoutResult {
  const { width, height, config, plotInset } = metrics;
  const columnSpace =
    getColumnItemWidth(metrics) + LEGEND_PADDING * 2 + config.verticalGap;
  const hasRoom =
    width - columnSpace - plotInset.width >= MIN_PLOT_WIDTH &&
    height >= MIN_COLUMN_CARD_HEIGHT;
  if (!alwaysVisible && !hasRoom) {
    return HIDDEN_LEGEND_LAYOUT;
  }
  if (!allowMostlyTruncated && isColumnMostlyTruncated(metrics)) {
    return HIDDEN_LEGEND_LAYOUT;
  }

  const visibleCount = getColumnVisibleCount(metrics, alwaysVisible ? 1 : 0);
  if (visibleCount < Math.min(minVisibleCount, metrics.itemWidths.length)) {
    return HIDDEN_LEGEND_LAYOUT;
  }

  const { itemWidths, measureOverflowLabel } = metrics;
  const overflowCount = itemWidths.length - visibleCount;
  const overflowLabelWidth =
    overflowCount > 0 ? measureOverflowLabel(overflowCount) : 0;
  const columnWidth = Math.max(
    getColumnItemWidth(metrics),
    Math.min(overflowLabelWidth, config.maxVerticalWidth),
  );

  return {
    type: "vertical",
    isBeforeChart,
    width: Math.ceil(columnWidth) + LEGEND_PADDING * 2,
    visibleCount,
  };
}
