import cx from "classnames";
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { Box, Flex } from "metabase/ui";
import type { TextWidthMeasurer } from "metabase/utils/measure-text";
import type { HoveredObject } from "metabase/viz-core";
import type { LegendPosition } from "metabase-types/api";

import { Legend } from "./Legend";
import { LegendActions } from "./LegendActions";
import type { LegendItemData } from "./LegendItem";
import S from "./LegendLayout.module.css";
import {
  HIDDEN_LEGEND_LAYOUT,
  getLayoutPlacement,
  getLegendLayout,
  getLegendMargins,
} from "./layout";
import { measureLegend } from "./measure";
import {
  type ChartSize,
  type LegendChart,
  getLegendPlots,
  getPlotsWithoutAxes,
} from "./plots";
import { getLegendSizeTier } from "./sizes";

interface LegendLayoutProps {
  className?: string;
  items: LegendItemData[];
  hovered?: HoveredObject | null;
  width?: number;
  height?: number;
  chart?: LegendChart;
  hasLegend: boolean;
  legendPosition?: LegendPosition;
  alwaysVisible?: boolean;
  actionButtons?: ReactNode;
  isFullscreen?: boolean;
  isQueryBuilder?: boolean;
  fontFamily: string;
  measureText: TextWidthMeasurer;
  children?: ReactNode;
  onHoverChange?: (data?: HoveredObject | null) => void;
  onSelectSeries?: (
    event: React.MouseEvent,
    index: number,
    isReversed?: boolean,
  ) => void;
  /**
   * With `onSelectSeries` also set, series titles render as links to the
   * returned URL. It's called when a title is hovered or focused, not on render.
   * Clicks still go to `onSelectSeries`; the URL serves middle-click and the
   * browser's link menu, such as "Open in new tab".
   */
  getSeriesHref?: (index: number) => string | undefined;
  onToggleSeriesVisibility?: (event: React.MouseEvent, index: number) => void;
  isReversed?: boolean;
}

export const LegendLayout = ({
  className,
  items,
  hovered,
  width = 0,
  height = 0,
  chart,
  hasLegend,
  legendPosition = "auto",
  alwaysVisible,
  actionButtons,
  isFullscreen,
  isQueryBuilder,
  fontFamily,
  measureText,
  children,
  onHoverChange,
  onSelectSeries,
  getSeriesHref,
  onToggleSeriesVisibility,
  isReversed,
}: LegendLayoutProps) => {
  const hasDimensions = width > 0 && height > 0;
  const canShowLegend = hasDimensions && hasLegend && legendPosition !== "off";
  const size = getLegendSizeTier({
    width,
    height,
    isQueryBuilder,
    isFullscreen,
  });
  const { rootRef, chartAreaRef, chartRoom } = useChartRoom(width, height);

  const metrics = useMemo(
    () =>
      canShowLegend
        ? measureLegend({
            items,
            width,
            height,
            chartRoom,
            size,
            fontFamily,
            measureText,
            isReversed,
          })
        : null,
    [
      canShowLegend,
      items,
      width,
      height,
      chartRoom,
      size,
      fontFamily,
      measureText,
      isReversed,
    ],
  );

  const plots = useMemo(() => {
    if (metrics == null) {
      return null;
    }
    return chart
      ? getLegendPlots(chart, metrics.chartSizes)
      : getPlotsWithoutAxes(metrics.chartSizes);
  }, [metrics, chart]);

  const layout = useMemo(
    () =>
      metrics && plots
        ? getLegendLayout(metrics, {
            position: legendPosition,
            plots,
            alwaysVisible,
          })
        : HIDDEN_LEGEND_LAYOUT,
    [metrics, plots, legendPosition, alwaysVisible],
  );

  const isLegendBeforeChart = layout.type !== "hidden" && layout.isBeforeChart;
  const margins =
    layout.type === "hidden"
      ? null
      : getLegendMargins(
          size,
          getLayoutPlacement(layout),
          plots?.column.internalInset ?? { left: 0, right: 0 },
        );
  // a zero margin stays unset so the four sides are not folded into a shorthand
  const nonZero = (value?: number) => value || undefined;

  const legendProps = {
    items,
    hovered,
    size,
    onHoverChange,
    onSelectSeries,
    getSeriesHref,
    onToggleSeriesVisibility,
    isReversed,
  };

  const horizontalLegend = layout.type === "horizontal" && (
    <Flex
      justify="center"
      flex="0 0 auto"
      miw={0}
      mt={nonZero(margins?.top)}
      mb={nonZero(margins?.bottom)}
      ml={Math.max(layout.indent, 0) + (margins?.left ?? 0)}
      mr={Math.max(-layout.indent, 0) + (margins?.right ?? 0)}
      data-testid="legend-horizontal"
    >
      <Legend {...legendProps} visibleLength={layout.visibleCount} />
    </Flex>
  );

  const verticalLegend = layout.type === "vertical" && (
    <Box
      className={cx(S.verticalLegend, CS.overflowHidden)}
      flex="0 0 auto"
      miw={0}
      mt={nonZero(margins?.top)}
      mb={nonZero(margins?.bottom)}
      ml={nonZero(margins?.left)}
      mr={nonZero(margins?.right)}
      style={{ width: layout.width }}
      data-testid="legend-vertical"
    >
      <Legend {...legendProps} visibleLength={layout.visibleCount} isVertical />
    </Box>
  );

  return (
    <Flex ref={rootRef} className={className} flex="1 1 auto" miw={0} mih={0}>
      {isLegendBeforeChart && verticalLegend}
      <Flex direction="column" flex="1 1 auto" miw={0} mih={0}>
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
        <Flex
          ref={chartAreaRef}
          direction="column"
          flex="1 1 auto"
          miw={0}
          mih={0}
        >
          {isLegendBeforeChart && horizontalLegend}
          {hasDimensions && (
            <Flex direction="column" flex="1 0 auto" mih={0}>
              {children}
            </Flex>
          )}
          {!isLegendBeforeChart && horizontalLegend}
        </Flex>
      </Flex>
      {!isLegendBeforeChart && verticalLegend}
    </Flex>
  );
};

// The legend root keeps its width and the chart area its height whichever
// legend shows, so the layout can depend on them without feeding back. They
// are measured when the card size props change, so a render the chart's own
// resize triggers before those props catch up keeps the room that matches them.
function useChartRoom(width: number, height: number) {
  const rootRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [chartRoom, setChartRoom] = useState<ChartSize>();

  useLayoutEffect(() => {
    const roomWidth = rootRef.current?.clientWidth ?? 0;
    const roomHeight = chartAreaRef.current?.clientHeight ?? 0;
    const measuredRoom =
      roomWidth > 0 && roomHeight > 0
        ? { width: roomWidth, height: roomHeight }
        : undefined;
    setChartRoom((room) =>
      _.isEqual(room, measuredRoom) ? room : measuredRoom,
    );
  }, [width, height]);

  return { rootRef, chartAreaRef, chartRoom };
}
