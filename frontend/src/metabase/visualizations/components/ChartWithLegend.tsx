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
import {
  CHART_WITH_LEGEND_PADDING,
  type GridSize,
  getChartLayout,
} from "./chart-with-legend-layout";
import type { LegendHover, LegendTitle } from "./types";

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
        paddingBottom: CHART_WITH_LEGEND_PADDING,
        paddingLeft: CHART_WITH_LEGEND_PADDING,
        paddingRight: CHART_WITH_LEGEND_PADDING,
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
