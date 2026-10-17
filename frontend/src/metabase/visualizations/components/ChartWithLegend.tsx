import cx from "classnames";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
  forwardRef,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import DashboardS from "metabase/css/dashboard.module.css";
import type { HoveredObject } from "metabase/viz-core";
import type { LegendPosition } from "metabase-types/api";

import styles from "./ChartWithLegend.module.css";
import { LegendHorizontal } from "./LegendHorizontal";
import { LegendVertical } from "./LegendVertical";
import { LEGEND_PLACEMENTS, type LegendPlacement } from "./legend/placement";
import type { LegendHover, LegendTitle } from "./types";

const GRID_ASPECT_RATIO = 4 / 3;
const PADDING = 14;

const DEFAULT_GRID_SIZE = 100;
export const HIDE_HORIZONTAL_LEGEND_THRESHOLD = 180;
export const HIDE_SECONDARY_INFO_THRESHOLD = 260;
const MIN_ROW_GRID_HEIGHT = 3;
const MIN_ROW_GRID_WIDTH = 2;

type GridSize = {
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

type ChartWithLegendProps = {
  children?: ReactNode;
  legendTitles: LegendTitle[];
  legendHiddenIndices?: number[];
  legendColors: string[];
  hovered?: HoveredObject | null;
  onHoverChange?: (hover?: LegendHover | null) => void;
  className?: string;
  chartClassName?: string;
  style?: CSSProperties;
  gridSize?: GridSize;
  aspectRatio?: number;
  height: number;
  width: number;
  legendPosition?: LegendPosition;
  isDashboard?: boolean;
  isDocument?: boolean;
  isMetricsViewer?: boolean;
  onToggleSeriesVisibility?: (event: MouseEvent, index: number) => void;
  forwardedRef?: Ref<HTMLDivElement>;
};

const ChartWithLegendInner = ({
  children,
  legendTitles,
  legendHiddenIndices,
  legendColors,
  hovered,
  onHoverChange,
  className,
  chartClassName,
  style = {},
  gridSize,
  aspectRatio = 1,
  height,
  width,
  legendPosition = "auto",
  isDashboard,
  isDocument,
  isMetricsViewer,
  onToggleSeriesVisibility = () => {},
  forwardedRef,
}: ChartWithLegendProps) => {
  const [stableWidth, setStableWidth] = useState(width);
  const [stableHeight, setStableHeight] = useState(height);

  useEffect(() => {
    // Use last valid dimensions to prevent flickering
    if (width > 0) {
      setStableWidth(width);
    }

    if (height > 0) {
      setStableHeight(height);
    }
  }, [height, width]);

  const layout = useMemo(
    () =>
      getChartLayout({
        position: legendPosition,
        width: stableWidth,
        height: stableHeight,
        gridSize,
        aspectRatio,
        legendTitles,
      }),
    [
      legendPosition,
      stableWidth,
      stableHeight,
      gridSize,
      aspectRatio,
      legendTitles,
    ],
  );

  const legend = layout.LegendComponent ? (
    <layout.LegendComponent
      className={styles.Legend}
      titles={layout.processedLegendTitles}
      hiddenIndices={legendHiddenIndices}
      colors={legendColors}
      hovered={hovered}
      onHoverChange={onHoverChange}
      onToggleSeriesVisibility={onToggleSeriesVisibility}
      isSingleRow={layout.isLegendSingleRow}
    />
  ) : null;

  return (
    <div
      className={cx(
        className,
        DashboardS.fullscreenNormalText,
        styles.ChartWithLegend,
        styles[layout.type],
        layout.flexChart && styles.flexChart,
        layout.isLegendBeforeChart
          ? styles.legendBeforeChart
          : styles.legendAfterChart,
      )}
      style={{
        ...style,
        paddingBottom: PADDING,
        paddingLeft: PADDING,
        paddingRight: PADDING,
      }}
      data-testid="chart-with-legend"
      data-legend-position={layout.type}
      ref={forwardedRef}
    >
      {legend && (
        <div className={cx(styles.LegendWrapper)} data-testid="chart-legend">
          {legend}
        </div>
      )}
      <div
        className={cx(styles.Chart, chartClassName)}
        style={{
          width: layout.chartWidth,
          height: layout.chartHeight,
        }}
      >
        {layout.hasDimensions && children}
      </div>
      {/* spacer div to balance legend */}
      {legend && (
        <div
          className={cx(styles.LegendSpacer)}
          // don't center the chart on dashboards
          style={
            isDashboard || isDocument || isMetricsViewer ? { flexBasis: 0 } : {}
          }
          data-testid="chart-legend-spacer"
        >
          {legend}
        </div>
      )}
    </div>
  );
};

const ChartWithLegendRefWrapper = forwardRef(
  function _ChartWithLegendRefWrapper(
    props: ChartWithLegendProps,
    ref: Ref<HTMLDivElement>,
  ) {
    return <ChartWithLegendInner {...props} forwardedRef={ref} />;
  },
);

export const ChartWithLegend = ExplicitSize<ChartWithLegendProps>({
  wrapped: true,
  refreshMode: "debounce",
})(ChartWithLegendRefWrapper);

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
  const adjustedWidth = width - PADDING * 2;
  const adjustedHeight = height - PADDING;
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
