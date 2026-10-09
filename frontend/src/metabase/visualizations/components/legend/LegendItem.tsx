import cx from "classnames";
import { memo } from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Ellipsified, Flex, UnstyledButton, rem } from "metabase/ui";

import S from "./Legend.module.css";
import { LegendItemDot } from "./LegendItemDot";
import { LEGEND_SIZES, type LegendSize } from "./layout";

export interface LegendItemData {
  key: string;
  color: string;
  name: string;
  visible?: boolean;
}

interface LegendItemProps {
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
  const isVisible = item.visible ?? true;
  const toggleLabel = isVisible ? t`Hide series` : t`Show series`;
  const isInteractive =
    onToggleSeriesVisibility !== undefined || onSelectSeries !== undefined;

  const handleItemClick = (event: React.MouseEvent) => {
    if (onToggleSeriesVisibility) {
      event.stopPropagation();
      onToggleSeriesVisibility(event, index);
      return;
    }
    onSelectSeries?.(event, index, isReversed);
  };

  const handleItemMouseEnter = (event: React.MouseEvent) => {
    onHoverChange?.({ index: index, element: event.currentTarget });
  };

  const handleItemMouseLeave = () => {
    onHoverChange?.();
  };

  return (
    <Flex align="center" miw={0} data-testid="legend-item">
      <Flex<typeof UnstyledButton | "div">
        component={isInteractive ? UnstyledButton : "div"}
        className={cx(S.itemLabel, {
          [S.clickableLabel]: isInteractive,
        })}
        align="center"
        miw={0}
        w="100%"
        opacity={isMuted ? 0.4 : 1}
        aria-label={onToggleSeriesVisibility ? toggleLabel : undefined}
        aria-description={onToggleSeriesVisibility ? item.name : undefined}
        aria-pressed={onToggleSeriesVisibility ? isVisible : undefined}
        onClick={isInteractive ? handleItemClick : undefined}
        onMouseEnter={onHoverChange && handleItemMouseEnter}
        onMouseLeave={onHoverChange && handleItemMouseLeave}
      >
        <LegendItemDot
          color={item.color}
          size={rem(dotSize)}
          isVisible={isVisible}
        />
        <Box
          component="span"
          className={cx(DashboardS.fullscreenNormalText, S.itemTitle)}
          c="text-primary"
          fz={typography}
          lh={typography}
          ml={dotGap}
          miw={0}
        >
          <Ellipsified>{item.name}</Ellipsified>
        </Box>
      </Flex>
    </Flex>
  );
};

export const LegendItem = memo(LegendItemInner);
