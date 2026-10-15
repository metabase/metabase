import cx from "classnames";
import { type ReactNode, useMemo } from "react";

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
  LEGEND_SIZES,
  getLegendLayout,
  getLegendSize,
} from "./layout";

interface LegendLayoutProps {
  className?: string;
  items: LegendItemData[];
  hovered?: HoveredObject | null;
  width?: number;
  height?: number;
  chartHeight?: number;
  indent?: number;
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
  onToggleSeriesVisibility?: (event: React.MouseEvent, index: number) => void;
  isReversed?: boolean;
}

export const LegendLayout = ({
  className,
  items,
  hovered,
  width = 0,
  height = 0,
  chartHeight,
  indent = 0,
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
  onToggleSeriesVisibility,
  isReversed,
}: LegendLayoutProps) => {
  const hasDimensions = width > 0 && height > 0;
  const size = getLegendSize({ width, height, isQueryBuilder, isFullscreen });

  const layout = useMemo(
    () =>
      getLegendLayout({
        items,
        position: legendPosition,
        width,
        height,
        chartHeight,
        horizontalWidth: width - Math.abs(indent),
        size,
        fontFamily,
        measureText,
        alwaysVisible,
        isReversed,
      }),
    [
      items,
      legendPosition,
      width,
      height,
      chartHeight,
      indent,
      size,
      fontFamily,
      measureText,
      alwaysVisible,
      isReversed,
    ],
  );

  const visibleLayout =
    hasDimensions && hasLegend ? layout : HIDDEN_LEGEND_LAYOUT;
  const isLegendBeforeChart =
    visibleLayout.type !== "hidden" && visibleLayout.isBeforeChart;
  const { horizontalGap, verticalGap } = LEGEND_SIZES[size];

  const legendProps = {
    items,
    hovered,
    size,
    onHoverChange,
    onSelectSeries,
    onToggleSeriesVisibility,
    isReversed,
  };

  const horizontalLegend = visibleLayout.type === "horizontal" && (
    <Flex
      justify="center"
      flex="0 0 auto"
      miw={0}
      mt={visibleLayout.isBeforeChart ? 0 : horizontalGap}
      mb={visibleLayout.isBeforeChart ? horizontalGap : 0}
      ml={Math.max(indent, 0)}
      mr={Math.max(-indent, 0)}
      data-testid="legend-horizontal"
    >
      <Legend {...legendProps} visibleLength={visibleLayout.visibleCount} />
    </Flex>
  );

  const verticalLegend = visibleLayout.type === "vertical" && (
    <Box
      className={S.verticalLegend}
      flex="0 0 auto"
      miw={0}
      ml={visibleLayout.isBeforeChart ? 0 : verticalGap}
      mr={visibleLayout.isBeforeChart ? verticalGap : 0}
      style={{ width: visibleLayout.width }}
      data-testid="legend-vertical"
    >
      <Legend
        {...legendProps}
        visibleLength={visibleLayout.visibleCount}
        isVertical
      />
    </Box>
  );

  return (
    <div className={cx(S.root, className)}>
      {isLegendBeforeChart && verticalLegend}
      <div className={S.main}>
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
        {isLegendBeforeChart && horizontalLegend}
        {hasDimensions && <div className={S.chart}>{children}</div>}
        {!isLegendBeforeChart && horizontalLegend}
      </div>
      {!isLegendBeforeChart && verticalLegend}
    </div>
  );
};
