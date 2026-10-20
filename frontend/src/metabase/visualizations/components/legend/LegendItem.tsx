import cx from "classnames";
import { memo } from "react";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Ellipsified, Flex, rem } from "metabase/ui";

import S from "./LegendItem.module.css";
import { LegendItemDot } from "./LegendItemDot";
import { LEGEND_SIZES, type LegendSize } from "./sizes";

export interface LegendItemData {
  key: string;
  color: string;
  name: string;
  visible?: boolean;
}

interface LegendItemProps {
  className?: string;
  item: LegendItemData;
  size?: LegendSize;
  index: number;
  isMuted?: boolean;
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
  className,
  item,
  size = "sm",
  index,
  isMuted,
  isReversed,
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
}: LegendItemProps) => {
  const { dotSize, dotGap, typography } = LEGEND_SIZES[size];
  const isClickable = onSelectSeries != null;

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
    <Flex
      className={cx(S.root, className)}
      align="center"
      miw={0}
      opacity={isMuted ? 0.4 : 1}
      onMouseEnter={onHoverChange && handleItemMouseEnter}
      onMouseLeave={onHoverChange && handleItemMouseLeave}
      data-testid="legend-item"
    >
      <LegendItemDot
        color={item.color}
        size={rem(dotSize)}
        isVisible={item.visible ?? true}
        onClick={onToggleSeriesVisibility && handleDotClick}
      />
      <Box
        className={cx(
          DashboardS.fullscreenNormalText,
          CS.textPrimary,
          CS.overflowHidden,
          { [CS.cursorPointer]: isClickable, [CS.textBrandHover]: isClickable },
        )}
        fz={typography}
        lh={typography}
        ml={dotGap}
        miw={0}
        onClick={onSelectSeries && handleItemClick}
      >
        <Ellipsified>{item.name}</Ellipsified>
      </Box>
    </Flex>
  );
};

export const LegendItem = memo(LegendItemInner);
