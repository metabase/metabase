import type { LegendPosition } from "metabase-types/api";

import { LegendHorizontal } from "./LegendHorizontal";
import { LegendVertical } from "./LegendVertical";
import { LEGEND_PLACEMENTS, type LegendPlacement } from "./legend/placement";
import type { LegendTitle } from "./types";

const GRID_ASPECT_RATIO = 4 / 3;
export const CHART_WITH_LEGEND_PADDING = 14;

const DEFAULT_GRID_SIZE = 100;
export const HIDE_HORIZONTAL_LEGEND_THRESHOLD = 180;
export const HIDE_SECONDARY_INFO_THRESHOLD = 260;
const MIN_ROW_GRID_HEIGHT = 3;
const MIN_ROW_GRID_WIDTH = 2;

export type GridSize = {
  width: number;
  height: number;
};

type ChartLayout = {
  type: "horizontal" | "vertical" | "small";
  isLegendBeforeChart: boolean;
  LegendComponent: typeof LegendHorizontal | typeof LegendVertical | undefined;
  isLegendSingleRow: boolean;
  processedLegendTitles: LegendTitle[];
  chartWidth: number | undefined;
  chartHeight: number | undefined;
  flexChart: boolean;
  hasDimensions: boolean;
};

interface LayoutArea {
  adjustedWidth: number;
  adjustedHeight: number;
  hasDimensions: boolean;
  aspectRatio: number;
  legendTitles: LegendTitle[];
}

export function getChartLayout({
  position,
  width,
  height,
  gridSize,
  aspectRatio,
  legendTitles,
}: {
  position: LegendPosition;
  width: number;
  height: number;
  gridSize: GridSize | undefined;
  aspectRatio: number;
  legendTitles: LegendTitle[];
}): ChartLayout {
  const adjustedWidth = width - CHART_WITH_LEGEND_PADDING * 2;
  const adjustedHeight = height - CHART_WITH_LEGEND_PADDING;
  const area: LayoutArea = {
    adjustedWidth,
    adjustedHeight,
    hasDimensions: adjustedWidth > 0 && adjustedHeight > 0,
    aspectRatio,
    legendTitles,
  };

  const placement = getPlacement(position, area, getGridSize(area, gridSize));
  if (placement == null) {
    return getSmallLayout(area);
  }

  const isAuto = position === "auto";
  const { orientation, isBeforeChart } = LEGEND_PLACEMENTS[placement];
  if (orientation === "vertical") {
    return getSideLayout(area, { isLegendBeforeChart: isBeforeChart });
  }
  return getStackedLayout(area, {
    isLegendBeforeChart: isBeforeChart,
    isLegendSingleRow: !isAuto,
  });
}

function getPlacement(
  position: LegendPosition,
  area: LayoutArea,
  grid: GridSize,
): LegendPlacement | null {
  if (position === "off") {
    return null;
  }
  if (position === "auto") {
    return getAutoPlacement(area, grid);
  }
  return hasRoomForPlacement(position, area, grid) ? position : null;
}

function getGridSize(
  { adjustedWidth, adjustedHeight }: LayoutArea,
  gridSize: GridSize | undefined,
): GridSize {
  return (
    gridSize ?? {
      width: adjustedWidth / DEFAULT_GRID_SIZE,
      height: adjustedHeight / DEFAULT_GRID_SIZE,
    }
  );
}

function getAutoPlacement(
  area: LayoutArea,
  grid: GridSize,
): LegendPlacement | null {
  const isHorizontal = grid.width > grid.height / GRID_ASPECT_RATIO;

  if (isHorizontal && hasRoomForColumn(area)) {
    return "left";
  }

  if (!isHorizontal && hasRoomForRow(grid)) {
    return "bottom";
  }

  return null;
}

function hasRoomForPlacement(
  placement: LegendPlacement,
  area: LayoutArea,
  grid: GridSize,
): boolean {
  const { orientation } = LEGEND_PLACEMENTS[placement];
  return orientation === "vertical"
    ? hasRoomForColumn(area)
    : hasRoomForRow(grid);
}

function hasRoomForColumn({ adjustedWidth }: LayoutArea): boolean {
  return adjustedWidth > HIDE_HORIZONTAL_LEGEND_THRESHOLD;
}

function hasRoomForRow(grid: GridSize): boolean {
  return grid.height > MIN_ROW_GRID_HEIGHT && grid.width > MIN_ROW_GRID_WIDTH;
}

function getSideLayout(
  {
    adjustedWidth,
    adjustedHeight,
    hasDimensions,
    aspectRatio,
    legendTitles,
  }: LayoutArea,
  { isLegendBeforeChart }: Pick<ChartLayout, "isLegendBeforeChart">,
): ChartLayout {
  const processedLegendTitles =
    adjustedWidth < HIDE_SECONDARY_INFO_THRESHOLD
      ? legendTitles.map((title) =>
          Array.isArray(title) ? title.slice(0, 1) : title,
        )
      : legendTitles;
  const desiredWidth = adjustedHeight * aspectRatio;
  const flexChart = desiredWidth > adjustedWidth * (2 / 3);

  return {
    type: "horizontal",
    isLegendBeforeChart,
    LegendComponent: LegendVertical,
    isLegendSingleRow: false,
    processedLegendTitles,
    chartWidth: flexChart ? undefined : desiredWidth,
    chartHeight: adjustedHeight,
    flexChart,
    hasDimensions,
  };
}

function getStackedLayout(
  {
    adjustedWidth,
    adjustedHeight,
    hasDimensions,
    aspectRatio,
    legendTitles,
  }: LayoutArea,
  {
    isLegendBeforeChart,
    isLegendSingleRow,
  }: Pick<ChartLayout, "isLegendBeforeChart" | "isLegendSingleRow">,
): ChartLayout {
  const processedLegendTitles = legendTitles.map((title) =>
    Array.isArray(title) ? title.join(" ") : title,
  );
  const desiredHeight = adjustedWidth * (1 / aspectRatio);
  const flexChart = desiredHeight > adjustedHeight * (3 / 4);

  return {
    type: "vertical",
    isLegendBeforeChart,
    LegendComponent: LegendHorizontal,
    isLegendSingleRow,
    processedLegendTitles,
    chartWidth: adjustedWidth,
    chartHeight: flexChart ? undefined : desiredHeight,
    flexChart,
    hasDimensions,
  };
}

function getSmallLayout({
  hasDimensions,
  legendTitles,
}: LayoutArea): ChartLayout {
  return {
    type: "small",
    isLegendBeforeChart: false,
    LegendComponent: undefined,
    isLegendSingleRow: false,
    processedLegendTitles: legendTitles,
    chartWidth: undefined,
    chartHeight: undefined,
    flexChart: false,
    hasDimensions,
  };
}
