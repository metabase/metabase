export type LegendSize = "sm" | "lg" | "md";

export interface LegendSizeConfig {
  typography: "sm" | "md";
  fontSize: number;
  lineHeight: number;
  dotSize: number;
  dotGap: number;
  itemGap: number;
  rowGap: number;
  // the vertical space between a top or bottom legend and the chart
  rowChartGap: number;
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
    rowChartGap: 12,
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
    rowChartGap: 16,
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
    rowChartGap: 24,
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
