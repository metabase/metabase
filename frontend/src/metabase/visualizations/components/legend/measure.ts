import { c } from "ttag";

import type { TextWidthMeasurer } from "metabase/utils/measure-text";

import type { LegendItemData } from "./LegendItem";
import {
  LEGEND_COLUMN_MARGIN_TOP,
  LEGEND_PADDING,
  MIN_VISIBLE_COUNT,
} from "./constants";
import type { ChartSize, LegendCandidates } from "./plots";
import { LEGEND_SIZES, type LegendSize, type LegendSizeConfig } from "./sizes";

const LEGEND_FONT_WEIGHT = 400;
const MAX_VERTICAL_WIDTH_RATIO = 0.25;

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

export const getOverflowLabel = (count: number) =>
  c("{0} is the number of hidden legend items").t`+ ${count} more`;

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
    chartRoom.height - LEGEND_COLUMN_MARGIN_TOP,
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

const getRowHeight = (config: LegendSizeConfig) =>
  config.fontSize * config.lineHeight +
  config.horizontalGap +
  LEGEND_PADDING * 2;

export const getDotWidth = (config: LegendSizeConfig) =>
  config.dotSize + config.dotGap;

export const getRowWidth = (itemWidths: number[], config: LegendSizeConfig) =>
  itemWidths.reduce((total, width) => total + width, 0) +
  config.itemGap * (itemWidths.length - 1);

export const getColumnItemWidth = ({
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
