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
import type { HoveredObject } from "metabase/visualizations/types";

import styles from "./ChartWithLegend.module.css";
import { LegendHorizontal } from "./LegendHorizontal";
import { LegendVertical } from "./LegendVertical";

const GRID_ASPECT_RATIO = 4 / 3;
const PADDING = 14;

const DEFAULT_GRID_SIZE = 100;
export const HIDE_HORIZONTAL_LEGEND_THRESHOLD = 180;
export const HIDE_SECONDARY_INFO_THRESHOLD = 260;

type LegendTitle = string | string[];

type LegendHover = {
  index: number;
  element?: HTMLElement | null;
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
  gridSize?: {
    width: number;
    height: number;
  };
  aspectRatio?: number;
  height: number;
  width: number;
  showLegend?: boolean;
  isDashboard?: boolean;
  isDocument?: boolean;
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
  showLegend = true,
  isDashboard,
  isDocument,
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

  const layout = useMemo(() => {
    // padding
    const adjustedWidth = stableWidth - PADDING * 2;
    const adjustedHeight = stableHeight - PADDING;

    const calculatedGridSize = gridSize || {
      width: adjustedWidth / DEFAULT_GRID_SIZE,
      height: adjustedHeight / DEFAULT_GRID_SIZE,
    };

    let chartWidth;
    let chartHeight;
    let flexChart = false;
    let type: "horizontal" | "vertical" | "small";
    let LegendComponent;
    let processedLegendTitles = legendTitles;

    const isHorizontal =
      calculatedGridSize.width > calculatedGridSize.height / GRID_ASPECT_RATIO;

    if (isHorizontal && adjustedWidth > HIDE_HORIZONTAL_LEGEND_THRESHOLD) {
      type = "horizontal";
      LegendComponent = LegendVertical;

      if (adjustedWidth < HIDE_SECONDARY_INFO_THRESHOLD) {
        processedLegendTitles = legendTitles.map((title) =>
          Array.isArray(title) ? title.slice(0, 1) : title,
        );
      }
      const desiredWidth = adjustedHeight * aspectRatio;
      if (desiredWidth > adjustedWidth * (2 / 3)) {
        flexChart = true;
      } else {
        chartWidth = desiredWidth;
      }
      chartHeight = adjustedHeight;
    } else if (
      !isHorizontal &&
      calculatedGridSize.height > 3 &&
      calculatedGridSize.width > 2
    ) {
      type = "vertical";
      LegendComponent = LegendHorizontal;
      processedLegendTitles = legendTitles.map((title) =>
        Array.isArray(title) ? title.join(" ") : title,
      );
      const desiredHeight = adjustedWidth * (1 / aspectRatio);
      if (desiredHeight > adjustedHeight * (3 / 4)) {
        flexChart = true;
      } else {
        chartHeight = desiredHeight;
      }
      chartWidth = adjustedWidth;
    } else {
      type = "small";
    }

    const hasDimensions = adjustedWidth > 0 && adjustedHeight > 0;

    return {
      type,
      LegendComponent,
      processedLegendTitles,
      chartWidth,
      chartHeight,
      flexChart,
      hasDimensions,
    };
  }, [stableWidth, stableHeight, gridSize, aspectRatio, legendTitles]);

  const legend =
    showLegend && layout.type !== "small" && layout.LegendComponent ? (
      <layout.LegendComponent
        className={styles.Legend}
        titles={layout.processedLegendTitles}
        hiddenIndices={legendHiddenIndices}
        colors={legendColors}
        dotSize={isDashboard ? "8px" : "12px"}
        hovered={hovered}
        onHoverChange={onHoverChange}
        onToggleSeriesVisibility={onToggleSeriesVisibility}
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
      )}
      style={{
        ...style,
        paddingBottom: PADDING,
        paddingLeft: PADDING,
        paddingRight: PADDING,
      }}
      data-testid="chart-with-legend"
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
          style={isDashboard || isDocument ? { flexBasis: 0 } : {}}
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
