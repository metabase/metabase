import cx from "classnames";
import { type ReactNode, useMemo } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Flex } from "metabase/ui";
import type { TextWidthMeasurer } from "metabase/utils/measure-text";
import type { HoveredObject } from "metabase/viz-core";

import { Legend } from "./Legend";
import { LegendActions } from "./LegendActions";
import type { LegendItemData } from "./LegendItem";
import S from "./LegendLayout.module.css";
import { LEGEND_SIZES, getLegendLayout, getLegendSize } from "./layout";

interface LegendLayoutProps {
  className?: string;
  items: LegendItemData[];
  hovered?: HoveredObject | null;
  width?: number;
  height?: number;
  chartHeight?: number;
  indent?: number;
  hasLegend: boolean;
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
  chartHeight,
  indent = 0,
  hasLegend,
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
  const size = getLegendSize({ width, height, isQueryBuilder, isFullscreen });

  const layout = useMemo(
    () =>
      getLegendLayout({
        items,
        width,
        height,
        chartHeight,
        horizontalWidth: width - Math.abs(indent),
        size,
        fontFamily,
        measureText,
        alwaysVisible,
      }),
    [
      items,
      width,
      height,
      chartHeight,
      indent,
      size,
      fontFamily,
      measureText,
      alwaysVisible,
    ],
  );

  const isVisible = hasDimensions && hasLegend && layout.type !== "hidden";
  const { horizontalGap, verticalGap } = LEGEND_SIZES[size];

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

  return (
    <Flex className={className} flex="1 1 auto" miw={0} mih={0}>
      <Flex direction="column" flex="1 1 auto" miw={0} mih={0}>
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
        {hasDimensions && (
          <Flex direction="column" flex="1 0 auto" mih={0}>
            {children}
          </Flex>
        )}
        {isVisible && layout.type === "horizontal" && (
          <Flex
            justify="center"
            flex="0 0 auto"
            miw={0}
            mt={horizontalGap}
            ml={Math.max(indent, 0)}
            mr={Math.max(-indent, 0)}
            data-testid="legend-horizontal"
          >
            <Legend {...legendProps} />
          </Flex>
        )}
      </Flex>
      {isVisible && layout.type === "vertical" && (
        <Box
          className={cx(S.verticalLegend, CS.overflowHidden)}
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
    </Flex>
  );
};
