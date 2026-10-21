import type { Padding } from "metabase/viz-core";

import type { LegendPlacement } from "./placement";

export type LegendSizeTier = "smallCard" | "largeCard" | "fullscreen";

export interface LegendSizeConfig {
  typography: "sm" | "md";
  fontSize: number;
  lineHeight: number;
  dotSize: number;
  dotGap: number;
  itemGap: number;
  rowGap: number;
  maxVerticalWidth: number;
  // We discount internal chart paddings when calculating the final legends-chart gap
  contentMargin: Record<`${LegendPlacement}Legend`, Partial<Padding>>;
  // Tells the container to show '+N more' before the list gets too close to the edge
  horizontalClearance: number;
}

export const LEGEND_SIZES = {
  smallCard: {
    typography: "sm",
    fontSize: 12,
    lineHeight: 1.15,
    dotSize: 8,
    dotGap: 6,
    itemGap: 12,
    rowGap: 8,
    maxVerticalWidth: 200,
    contentMargin: {
      topLegend: { top: 4, bottom: 4 },
      bottomLegend: { top: 6, bottom: 4 },
      leftLegend: { right: 24, top: 10 },
      rightLegend: { left: 24, top: 10 },
    },
    horizontalClearance: 16,
  },
  largeCard: {
    typography: "sm",
    fontSize: 12,
    lineHeight: 1.15,
    dotSize: 8,
    dotGap: 6,
    itemGap: 12,
    rowGap: 12,
    maxVerticalWidth: 200,
    contentMargin: {
      topLegend: { top: 4, bottom: 8 },
      bottomLegend: { top: 8, bottom: 4 },
      leftLegend: { right: 32, top: 10 },
      rightLegend: { left: 32, top: 10 },
    },
    horizontalClearance: 40,
  },
  fullscreen: {
    typography: "md",
    fontSize: 14,
    lineHeight: 1.22,
    dotSize: 14,
    dotGap: 8,
    itemGap: 16,
    rowGap: 16,
    maxVerticalWidth: 256,
    contentMargin: {
      topLegend: { bottom: 16, top: 8 },
      bottomLegend: { top: 24 },
      leftLegend: { right: 48, top: 10 },
      rightLegend: { left: 48, right: 16, top: 10 },
    },
    horizontalClearance: 24,
  },
} as const satisfies Record<LegendSizeTier, LegendSizeConfig>;

// mirrors the large card tier in visualizations/CartesianChart/sizing.ts
const LARGE_CARD_MIN_WIDTH = 640;
const LARGE_CARD_MIN_HEIGHT = 360;

interface GetLegendSizeTierOptions {
  width: number;
  height: number;
  isQueryBuilder?: boolean;
  isFullscreen?: boolean;
}

export const getLegendSizeTier = ({
  width,
  height,
  isQueryBuilder,
  isFullscreen,
}: GetLegendSizeTierOptions): LegendSizeTier => {
  if (isQueryBuilder || isFullscreen) {
    return "fullscreen";
  }
  return width >= LARGE_CARD_MIN_WIDTH && height >= LARGE_CARD_MIN_HEIGHT
    ? "largeCard"
    : "smallCard";
};
