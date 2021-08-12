import React, { useCallback, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  LegendButtonContainer,
  LegendLink,
  LegendLinkContainer,
  LegendRoot,
} from "./Legend.styled";
import LegendItem from "./LegendItem";
import Popover from "metabase/components/Popover";

const propTypes = {
  className: PropTypes.string,
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  visibleIndex: PropTypes.number,
  visibleLength: PropTypes.number,
  actionButtons: PropTypes.node,
  isNarrow: PropTypes.bool,
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
  visibleIndex = 0,
  visibleLength = labels.length,
  actionButtons,
  isNarrow,
  isVertical,
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
}) => {
  const targetRef = useRef();
  const [isOpened, setIsOpened] = useState(null);
  const handleOpenPopover = useCallback(() => setIsOpened(true), []);
  const handleClosePopover = useCallback(() => setIsOpened(false), []);

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
            isNarrow={isNarrow}
            isVertical={isVertical}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onRemoveSeries={onRemoveSeries}
          />
        );
      })}
      {overflowLength > 0 && (
        <LegendLinkContainer isVertical={isVertical}>
          <LegendLink innerRef={targetRef} onClick={handleOpenPopover}>
            And {overflowLength} more
          </LegendLink>
        </LegendLinkContainer>
      )}
      {isOpened && (
        <Popover target={targetRef.current} onClose={handleClosePopover}>
          <Legend
            labels={labels}
            colors={colors}
            hovered={hovered}
            visibleIndex={overflowIndex}
            visibleLength={overflowLength}
            isNarrow={isNarrow}
            isVertical={isVertical}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onRemoveSeries={onRemoveSeries}
          />
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
