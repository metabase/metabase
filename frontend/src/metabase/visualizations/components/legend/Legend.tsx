import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import { Box, Flex, Popover, Text, rem } from "metabase/ui";
import type { HoveredObject } from "metabase/viz-core";

import S from "./Legend.module.css";
import type { LegendItemData } from "./LegendItem";
import { LegendItem } from "./LegendItem";
import {
  LEGEND_PADDING,
  LEGEND_SIZES,
  type LegendSize,
  getOverflowLabel,
} from "./layout";

const POPOVER_BORDER = 1;
const POPOVER_PADDING = 8;
const POPOVER_OFFSET = POPOVER_BORDER + POPOVER_PADDING;

interface LegendProps {
  className?: string;
  items: LegendItemData[];
  hovered?: HoveredObject | null;
  visibleIndex?: number;
  visibleLength?: number;
  isVertical?: boolean;
  size?: LegendSize;
  onHoverChange?: (data?: HoveredObject | null) => void;
  onSelectSeries?: (
    event: React.MouseEvent,
    index: number,
    isReversed?: boolean,
  ) => void;
  onToggleSeriesVisibility?: (event: React.MouseEvent, index: number) => void;
  isReversed?: boolean;
}

export const Legend = ({
  className,
  items: originalItems,
  hovered,
  visibleIndex = 0,
  visibleLength = originalItems.length,
  isVertical,
  size = "sm",
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
  isReversed,
}: LegendProps) => {
  const items = isReversed ? _.clone(originalItems).reverse() : originalItems;

  const overflowIndex = visibleIndex + visibleLength;
  const visibleItems = items.slice(visibleIndex, overflowIndex);
  const overflowLength = items.length - overflowIndex;
  const { itemGap, rowGap, maxVerticalWidth, typography } = LEGEND_SIZES[size];

  return (
    <Flex
      className={cx({ [S.horizontalRoot]: !isVertical }, className)}
      aria-label={t`Legend`}
      direction={isVertical ? "column" : "row"}
      align={isVertical ? "stretch" : "center"}
      gap={isVertical ? rowGap : itemGap}
      miw={0}
      maw="100%"
      p={LEGEND_PADDING}
    >
      {visibleItems.map((item, index) => {
        const localIndex = index + visibleIndex;
        const itemIndex = isReversed
          ? items.length - 1 - localIndex
          : localIndex;

        return (
          <LegendItem
            key={item.key}
            item={item}
            index={itemIndex}
            isMuted={hovered != null && itemIndex !== hovered.index}
            size={size}
            isReversed={isReversed}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onToggleSeriesVisibility={onToggleSeriesVisibility}
          />
        );
      })}
      {overflowLength > 0 && (
        <Popover
          width={rem(maxVerticalWidth)}
          offset={POPOVER_OFFSET}
          position="top-start"
        >
          <Popover.Target>
            <Text
              component="div"
              className={S.overflowLabel}
              c="text-secondary"
              fz={typography}
              lh={typography}
            >
              {getOverflowLabel(overflowLength)}
            </Text>
          </Popover.Target>
          <Popover.Dropdown>
            <Box className={S.popoverScroll} p="sm">
              <Legend
                items={originalItems}
                hovered={hovered}
                visibleIndex={overflowIndex}
                visibleLength={overflowLength}
                isVertical={isVertical}
                size={size}
                onHoverChange={onHoverChange}
                onSelectSeries={onSelectSeries}
                onToggleSeriesVisibility={onToggleSeriesVisibility}
                isReversed={isReversed}
              />
            </Box>
          </Popover.Dropdown>
        </Popover>
      )}
    </Flex>
  );
};
