import React, { useCallback, useRef, useState } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import Popover from "metabase/components/Popover";
import {
  LegendButtonContainer,
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
  actionButtons: PropTypes.node,
  visibleIndex: PropTypes.number,
  visibleLength: PropTypes.number,
  isVertical: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onAddSeries: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const Legend = ({
  className,
  labels,
  colors,
  hovered,
  actionButtons,
  visibleIndex = 0,
  visibleLength = labels.length,
  isVertical,
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
}) => {
  const targetRef = useRef();
  const [isOpened, setIsOpened] = useState(null);
  const handleOpen = useCallback(() => setIsOpened(true), []);
  const handleClose = useCallback(() => setIsOpened(false), []);

  const overflowIndex = visibleIndex + visibleLength;
  const visibleLabels = labels.slice(visibleIndex, overflowIndex);
  const overflowLength = labels.length - overflowIndex;

  return (
    <LegendRoot className={className} isVertical={isVertical}>
      {visibleLabels.map((label, index) => {
        const itemIndex = index + visibleIndex;

        return (
          <LegendItem
            key={itemIndex}
            label={label}
            index={itemIndex}
            color={colors[itemIndex % colors.length]}
            isMuted={hovered && itemIndex !== hovered.index}
            isVertical={isVertical}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onRemoveSeries={onRemoveSeries}
          />
        );
      })}
      {overflowLength > 0 && (
        <LegendLinkContainer innerRef={targetRef} isVertical={isVertical}>
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
          <LegendPopoverContainer>
            <Legend
              labels={labels}
              colors={colors}
              hovered={hovered}
              visibleIndex={overflowIndex}
              visibleLength={overflowLength}
              isVertical={isVertical}
              onHoverChange={onHoverChange}
              onSelectSeries={onSelectSeries}
              onRemoveSeries={onRemoveSeries}
            />
          </LegendPopoverContainer>
        </Popover>
      )}
      {actionButtons && (
        <LegendButtonContainer isVertical={isVertical}>
          {actionButtons}
        </LegendButtonContainer>
      )}
    </LegendRoot>
  );
};

Legend.propTypes = propTypes;

export default Legend;
