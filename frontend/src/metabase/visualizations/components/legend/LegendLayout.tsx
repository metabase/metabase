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
  type PlotInset,
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
  plotInset?: PlotInset;
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
  plotInset,
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

  const layout = useMemo(() => {
    if (!hasDimensions || !hasLegend) {
      return HIDDEN_LEGEND_LAYOUT;
    }
    return getLegendLayout({
      items,
      position: legendPosition,
      width,
      height,
      chartHeight,
      horizontalWidth: width - Math.abs(indent),
      plotInset,
      size,
      fontFamily,
      measureText,
      alwaysVisible,
      isReversed,
    });
  }, [
    hasDimensions,
    hasLegend,
    items,
    legendPosition,
    width,
    height,
    chartHeight,
    indent,
    plotInset,
    size,
    fontFamily,
    measureText,
    alwaysVisible,
    isReversed,
  ]);

  const isLegendBeforeChart = layout.type !== "hidden" && layout.isBeforeChart;
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

  const horizontalLegend = layout.type === "horizontal" && (
    <Flex
      justify="center"
      flex="0 0 auto"
      miw={0}
      mt={isLegendBeforeChart ? 0 : horizontalGap}
      mb={isLegendBeforeChart ? horizontalGap : 0}
      ml={layout.isIndented ? Math.max(indent, 0) : 0}
      mr={layout.isIndented ? Math.max(-indent, 0) : 0}
      data-testid="legend-horizontal"
    >
      <Legend {...legendProps} visibleLength={layout.visibleCount} />
    </Flex>
  );

  const verticalLegend = layout.type === "vertical" && (
    <Box
      className={S.verticalLegend}
      flex="0 0 auto"
      miw={0}
      ml={isLegendBeforeChart ? 0 : verticalGap}
      mr={isLegendBeforeChart ? verticalGap : 0}
      style={{ width: layout.width }}
      data-testid="legend-vertical"
    >
      <Legend {...legendProps} visibleLength={layout.visibleCount} isVertical />
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
