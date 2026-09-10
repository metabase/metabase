import { c } from "ttag";

import type { TextWidthMeasurer } from "metabase/utils/measure-text";

import type { LegendItemData } from "./LegendItem";

export type LegendSize = "sm" | "md";

interface LegendSizeConfig {
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
  md: {
    fontSize: 14,
    lineHeight: 1.22,
    dotSize: 14,
    dotGap: 8,
    itemGap: 16,
    rowGap: 12,
    horizontalGap: 24,
    verticalGap: 24,
    maxVerticalWidth: 256,
    horizontalPadding: 48,
    verticalPadding: 32,
  },
} as const satisfies Record<LegendSize, LegendSizeConfig>;

export const LEGEND_FONT_WEIGHT = 400;
// room for the focus outline of the legend items
export const LEGEND_PADDING = 2;
export const MIN_LEGEND_CARD_WIDTH = 420;
export const MIN_LEGEND_CARD_HEIGHT = 200;
const MAX_VERTICAL_WIDTH_RATIO = 0.25;
const MAX_TRUNCATED_ITEMS_RATIO = 0.5;
export type LegendLayoutResult =
  | { type: "hidden" }
  | { type: "horizontal" }
  | { type: "vertical"; width: number; visibleCount: number };

interface GetLegendLayoutOptions {
  items: LegendItemData[];
  width: number;
  height: number;
  chartHeight?: number;
  size: LegendSize;
  fontFamily: string;
  measureText: TextWidthMeasurer;
  alwaysVisible?: boolean;
}

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);

export const getOverflowLabel = (count: number) =>
  c("{0} is the number of hidden legend items").t`+ ${count} more`;

export function getLegendLayout({
  items,
  width,
  height,
  chartHeight,
  size,
  fontFamily,
  measureText,
  alwaysVisible = false,
}: GetLegendLayoutOptions): LegendLayoutResult {
  const isCardTooSmall =
    width < MIN_LEGEND_CARD_WIDTH || height < MIN_LEGEND_CARD_HEIGHT;
  if (items.length === 0 || (isCardTooSmall && !alwaysVisible)) {
    return { type: "hidden" };
  }

  const config = LEGEND_SIZES[size];
  const font = {
    size: config.fontSize,
    weight: LEGEND_FONT_WEIGHT,
    family: fontFamily,
  };
  const labelWidths = items.map((item) => measureText(item.name, font));
  const itemWidths = labelWidths.map(
    (labelWidth) => config.dotSize + config.dotGap + labelWidth,
  );

  const availableWidth = width - config.horizontalPadding;
  const horizontalWidth = sum(itemWidths) + config.itemGap * (items.length - 1);
  if (horizontalWidth <= availableWidth) {
    return { type: "horizontal" };
  }

  const legendWidth = Math.min(
    Math.max(...itemWidths),
    availableWidth * MAX_VERTICAL_WIDTH_RATIO,
    config.maxVerticalWidth,
  );
  const maxLabelWidth =
    config.maxVerticalWidth - (config.dotSize + config.dotGap);
  const truncatedCount = labelWidths.filter((w) => w > maxLabelWidth).length;
  const isMostlyTruncated =
    truncatedCount > items.length * MAX_TRUNCATED_ITEMS_RATIO;
  if (isMostlyTruncated && !alwaysVisible) {
    return { type: "hidden" };
  }

  const availableHeight =
    (chartHeight ?? height - config.verticalPadding) - LEGEND_PADDING * 2;
  const rowPitch = config.fontSize * config.lineHeight + config.rowGap;
  const maxRows = Math.floor((availableHeight + config.rowGap) / rowPitch);
  // the last row is reserved for the "+ N more" label when items overflow
  const visibleCount =
    items.length <= maxRows
      ? items.length
      : Math.max(maxRows - 1, alwaysVisible ? 1 : 0);
  if (visibleCount === 0) {
    return { type: "hidden" };
  }

  const overflowCount = items.length - visibleCount;
  const overflowLabelWidth =
    overflowCount > 0 ? measureText(getOverflowLabel(overflowCount), font) : 0;
  const columnWidth = Math.max(
    legendWidth,
    Math.min(overflowLabelWidth, config.maxVerticalWidth),
  );

  return {
    type: "vertical",
    width: Math.ceil(columnWidth) + LEGEND_PADDING * 2,
    visibleCount,
  };
}
