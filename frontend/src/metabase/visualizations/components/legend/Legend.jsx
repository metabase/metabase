import PropTypes from "prop-types";
import { useCallback, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import Popover from "metabase/components/Popover";

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
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
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
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
  isReversed,
  canRemoveSeries = alwaysTrue,
}) => {
  const targetRef = useRef();
  const [isOpened, setIsOpened] = useState(null);
  const [maxWidth, setMaxWidth] = useState(0);

  const handleOpen = useCallback(() => {
    setIsOpened(true);
    setMaxWidth(targetRef.current.offsetWidth);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpened(false);
    setMaxWidth(0);
  }, []);

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
            isReversed={isReversed}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onRemoveSeries={
              canRemoveSeries(itemIndex) ? onRemoveSeries : undefined
            }
          />
        );
      })}
      {overflowLength > 0 && (
        <LegendLinkContainer ref={targetRef} isVertical={isVertical}>
          <LegendLink onMouseDown={handleOpen}>
            {t`And ${overflowLength} more`}
          </LegendLink>
        </LegendLinkContainer>
      )}
      {isOpened && (
        <Popover
          target={targetRef.current}
          targetOffsetX={POPOVER_OFFSET}
          horizontalAttachments={["left"]}
          verticalAttachments={["top", "bottom"]}
          sizeToFit
          onClose={handleClose}
        >
          <LegendPopoverContainer style={{ maxWidth }}>
            <Legend
              items={originalItems}
              hovered={hovered}
              visibleIndex={overflowIndex}
              visibleLength={overflowLength}
              isVertical={isVertical}
              onHoverChange={onHoverChange}
              onSelectSeries={onSelectSeries}
              onRemoveSeries={onRemoveSeries}
              isReversed={isReversed}
            />
          </LegendPopoverContainer>
        </Popover>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default Legend;
