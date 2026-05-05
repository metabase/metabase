import { t } from "ttag";
import _ from "underscore";

import { Popover } from "metabase/ui";
import type { HoveredObject } from "metabase/visualizations/types";

import {
  LegendLink,
  LegendLinkContainer,
  LegendPopoverContainer,
  LegendRoot,
} from "./Legend.styled";
import type { LegendItemData } from "./LegendItem";
import { LegendItem } from "./LegendItem";

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
  isInsidePopover?: boolean;
  isQueryBuilder?: boolean;
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
  isInsidePopover,
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
  isReversed,
  isQueryBuilder,
}: LegendProps) => {
  const items = isReversed ? _.clone(originalItems).reverse() : originalItems;

  const overflowIndex = visibleIndex + visibleLength;
  const visibleItems = items.slice(visibleIndex, overflowIndex);
  const overflowLength = items.length - overflowIndex;

  return (
    <LegendRoot
      className={className}
      aria-label={t`Legend`}
      isVertical={!!isVertical}
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
            dotSize={isQueryBuilder ? "12px" : "8px"}
            isVertical={isVertical}
            isInsidePopover={isInsidePopover}
            isReversed={isReversed}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onToggleSeriesVisibility={onToggleSeriesVisibility}
          />
        );
      })}
      {overflowLength > 0 && (
        <Popover width="target" offset={POPOVER_OFFSET} position="top-start">
          <Popover.Target>
            <LegendLinkContainer isVertical={!!isVertical}>
              <LegendLink>{t`And ${overflowLength} more`}</LegendLink>
            </LegendLinkContainer>
          </Popover.Target>
          <Popover.Dropdown>
            <LegendPopoverContainer>
              <Legend
                items={originalItems}
                hovered={hovered}
                visibleIndex={overflowIndex}
                visibleLength={overflowLength}
                isVertical={isVertical}
                isInsidePopover
                onHoverChange={onHoverChange}
                onSelectSeries={onSelectSeries}
                onToggleSeriesVisibility={onToggleSeriesVisibility}
                isReversed={isReversed}
              />
            </LegendPopoverContainer>
          </Popover.Dropdown>
        </Popover>
      )}
    </LegendRoot>
  );
};
