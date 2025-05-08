import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import { Popover } from "metabase/ui";

import {
  LegendLink,
  LegendLinkContainer,
  LegendPopoverContainer,
  LegendRoot,
} from "./Legend.styled";
import LegendItem from "./LegendItem";

const POPOVER_BORDER = 1;
const POPOVER_PADDING = 8;
const POPOVER_OFFSET = POPOVER_BORDER + POPOVER_PADDING;

const propTypes = {
  className: PropTypes.string,
  items: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  visibleIndex: PropTypes.number,
  visibleLength: PropTypes.number,
  isVertical: PropTypes.bool,
  isInsidePopover: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onToggleSeriesVisibility: PropTypes.func,
  onRemoveSeries: PropTypes.func,
  isReversed: PropTypes.bool,
  canRemoveSeries: PropTypes.func,
};

const alwaysTrue = () => true;

const Legend = ({
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
  onRemoveSeries,
  isReversed,
  canRemoveSeries = alwaysTrue,
}) => {
  const items = isReversed ? _.clone(originalItems).reverse() : originalItems;

  const overflowIndex = visibleIndex + visibleLength;
  const visibleItems = items.slice(visibleIndex, overflowIndex);
  const overflowLength = items.length - overflowIndex;

  return (
    <LegendRoot
      className={className}
      aria-label={t`Legend`}
      isVertical={isVertical}
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
            isMuted={hovered && itemIndex !== hovered.index}
            isVertical={isVertical}
            isInsidePopover={isInsidePopover}
            isReversed={isReversed}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onToggleSeriesVisibility={onToggleSeriesVisibility}
            onRemoveSeries={
              canRemoveSeries(itemIndex) ? onRemoveSeries : undefined
            }
          />
        );
      })}
      {overflowLength > 0 && (
        <Popover width="target" offset={POPOVER_OFFSET} placement="top-start">
          <Popover.Target>
            <LegendLinkContainer isVertical={isVertical}>
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
                onRemoveSeries={onRemoveSeries}
                isReversed={isReversed}
              />
            </LegendPopoverContainer>
          </Popover.Dropdown>
        </Popover>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default Legend;
