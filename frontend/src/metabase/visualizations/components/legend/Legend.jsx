import { useCallback, useRef, useState } from "react";
import PropTypes from "prop-types";
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
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
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
  labels: originalLabels,
  colors: originalColors,
  hovered,
  visibleIndex = 0,
  visibleLength = originalLabels.length,
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

  const labels = isReversed
    ? _.clone(originalLabels).reverse()
    : originalLabels;
  const colors = isReversed
    ? _.clone(originalColors).reverse()
    : originalColors;

  const overflowIndex = visibleIndex + visibleLength;
  const visibleLabels = labels.slice(visibleIndex, overflowIndex);
  const overflowLength = labels.length - overflowIndex;

  return (
    <LegendRoot
      className={className}
      aria-label={t`Legend`}
      isVertical={isVertical}
    >
      {visibleLabels.map((label, index) => {
        const localIndex = index + visibleIndex;
        const itemIndex = isReversed
          ? labels.length - 1 - localIndex
          : localIndex;

        return (
          <LegendItem
            key={itemIndex}
            label={label}
            index={itemIndex}
            color={colors[localIndex % colors.length]}
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
              labels={originalLabels}
              colors={originalColors}
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
