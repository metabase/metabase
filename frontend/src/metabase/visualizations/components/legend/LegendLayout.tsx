import type { ReactNode } from "react";

import { Legend } from "./Legend";
import { LegendActions } from "./LegendActions";
import type { LegendItemData } from "./LegendItem";
import {
  ChartContainer,
  LegendContainer,
  LegendLayoutRoot,
  MainContainer,
} from "./LegendLayout.styled";

const MIN_ITEM_WIDTH = 100;
const MIN_ITEM_HEIGHT = 25;
const MIN_ITEM_HEIGHT_LARGE = 31;
const MIN_LEGEND_WIDTH = 400;

interface LegendLayoutProps {
  className?: string;
  items: LegendItemData[];
  hovered?: { index?: number } | null;
  width?: number;
  height?: number;
  hasLegend?: boolean;
  actionButtons?: ReactNode;
  isFullscreen?: boolean;
  isQueryBuilder?: boolean;
  children?: ReactNode;
  onHoverChange?: (data?: { index: number; element: Element }) => void;
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
  hasLegend,
  actionButtons,
  isFullscreen,
  isQueryBuilder,
  children,
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
  isReversed,
}: LegendLayoutProps) => {
  const hasDimensions = width != null && height != null;
  const itemHeight = !isFullscreen ? MIN_ITEM_HEIGHT : MIN_ITEM_HEIGHT_LARGE;
  const maxXItems = Math.floor(width / MIN_ITEM_WIDTH);
  const maxYItems = Math.floor(height / itemHeight);
  const maxYLabels = Math.max(maxYItems - 1, 0);
  const minYLabels = items.length > maxYItems ? maxYLabels : items.length;

  const isNarrow = width < MIN_LEGEND_WIDTH;

  const isVertical = maxXItems < items.length;
  const isHorizontal = !isVertical;

  const isVisible = hasLegend && !(isVertical && isNarrow);
  const visibleLength = isVertical ? minYLabels : items.length;

  const legend = (
    <LegendContainer
      isVertical={!!isVertical}
      isQueryBuilder={!!isQueryBuilder}
    >
      <Legend
        items={items}
        hovered={hovered}
        visibleLength={visibleLength}
        isVertical={isVertical}
        onHoverChange={onHoverChange}
        onSelectSeries={onSelectSeries}
        onToggleSeriesVisibility={onToggleSeriesVisibility}
        isQueryBuilder={isQueryBuilder}
        isReversed={isReversed}
      />
      {!isVertical && actionButtons && (
        <LegendActions>{actionButtons}</LegendActions>
      )}
    </LegendContainer>
  );

  return (
    <LegendLayoutRoot className={className} isVertical={isVertical}>
      {isVisible && isHorizontal && legend}
      <MainContainer>
        {isVertical && actionButtons && (
          <LegendActions>{actionButtons}</LegendActions>
        )}
        {hasDimensions && <ChartContainer>{children}</ChartContainer>}
      </MainContainer>
      {isVisible && isVertical && legend}
    </LegendLayoutRoot>
  );
};
