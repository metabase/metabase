import cx from "classnames";
import { type ReactNode, useMemo } from "react";

import { Box, Flex } from "metabase/ui";
import type { TextWidthMeasurer } from "metabase/utils/measure-text";
import type { HoveredObject } from "metabase/viz-core";

import { Legend } from "./Legend";
import { LegendActions } from "./LegendActions";
import type { LegendItemData } from "./LegendItem";
import S from "./LegendLayout.module.css";
import { LEGEND_SIZES, type LegendSize, getLegendLayout } from "./layout";

interface LegendLayoutProps {
  className?: string;
  items: LegendItemData[];
  hovered?: HoveredObject | null;
  width?: number;
  height?: number;
  chartHeight?: number;
  hasLegend?: boolean;
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
  hasLegend,
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
  const size: LegendSize = isQueryBuilder || isFullscreen ? "md" : "sm";

  const layout = useMemo(
    () =>
      getLegendLayout({
        items,
        width,
        height,
        chartHeight,
        size,
        fontFamily,
        measureText,
      }),
    [items, width, height, chartHeight, size, fontFamily, measureText],
  );

  const isVisible = hasDimensions && !!hasLegend && layout.type !== "hidden";
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

  return (
    <div className={cx(S.root, className)}>
      <div className={S.main}>
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
        {hasDimensions && <div className={S.chart}>{children}</div>}
        {isVisible && layout.type === "horizontal" && (
          <Flex
            justify="center"
            flex="0 0 auto"
            miw={0}
            mt={horizontalGap}
            data-testid="legend-horizontal"
          >
            <Legend {...legendProps} />
          </Flex>
        )}
      </div>
      {isVisible && layout.type === "vertical" && (
        <Box
          className={S.verticalLegend}
          flex="0 0 auto"
          miw={0}
          ml={verticalGap}
          style={{ width: layout.width }}
          data-testid="legend-vertical"
        >
          <Legend
            {...legendProps}
            visibleLength={layout.visibleCount}
            isVertical
          />
        </Box>
      )}
    </div>
  );
};
