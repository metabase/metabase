import cx from "classnames";
import { memo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import DashboardS from "metabase/css/dashboard.module.css";

import {
  LegendItemLabel,
  LegendItemRoot,
  LegendItemTitle,
} from "./LegendItem.styled";
import { LegendItemDot } from "./LegendItemDot";

export interface LegendItemData {
  key: string;
  color: string;
  name: string;
  visible?: boolean;
}

interface LegendItemProps {
  item: LegendItemData;
  dotSize?: string;
  index: number;
  isMuted?: boolean;
  isVertical?: boolean;
  isInsidePopover?: boolean;
  isReversed?: boolean;
  onHoverChange?: (data?: { index: number; element: Element }) => void;
  onSelectSeries?: (
    event: React.MouseEvent,
    index: number,
    isReversed?: boolean,
  ) => void;
  onToggleSeriesVisibility?: (event: React.MouseEvent, index: number) => void;
}

const LegendItemInner = ({
  item,
  dotSize = "8px",
  index,
  isMuted,
  isVertical,
  isInsidePopover,
  isReversed,
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
}: LegendItemProps) => {
  const handleDotClick = (event: React.MouseEvent) => {
    onToggleSeriesVisibility?.(event, index);
  };

  const handleItemClick = (event: React.MouseEvent) => {
    onSelectSeries?.(event, index, isReversed);
  };

  const handleItemMouseEnter = (event: React.MouseEvent) => {
    onHoverChange?.({ index: index, element: event.currentTarget });
  };

  const handleItemMouseLeave = () => {
    onHoverChange?.();
  };

  return (
    <LegendItemRoot isVertical={!!isVertical} data-testid="legend-item">
      <LegendItemLabel
        isMuted={!!isMuted}
        onMouseEnter={onHoverChange && handleItemMouseEnter}
        onMouseLeave={onHoverChange && handleItemMouseLeave}
      >
        <LegendItemDot
          color={item.color}
          size={dotSize}
          isVisible={item.visible ?? true}
          onClick={onToggleSeriesVisibility && handleDotClick}
        />
        <LegendItemTitle
          className={cx(
            DashboardS.fullscreenNormalText,
            DashboardS.DashboardChartLegend,
          )}
          dotSize={dotSize}
          isInsidePopover={isInsidePopover}
          onClick={onSelectSeries && handleItemClick}
        >
          <Ellipsified>{item.name}</Ellipsified>
        </LegendItemTitle>
      </LegendItemLabel>
    </LegendItemRoot>
  );
};

export const LegendItem = memo(LegendItemInner);
