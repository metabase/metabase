import React, { useCallback, useState } from "react";
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
  sliceIndex: PropTypes.number,
  sliceLength: PropTypes.number,
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
  sliceIndex = 0,
  sliceLength = labels.length,
  actionButtons,
  isNarrow,
  isVertical,
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
}) => {
  const [target, setTarget] = useState(null);
  const overflowIndex = sliceIndex + sliceLength;
  const visibleLabels = labels.slice(sliceIndex, overflowIndex);
  const overflowLength = labels.length - overflowIndex;

  const handleOpenPopover = useCallback(event => {
    setTarget(event.target);
  }, []);

  const handleClosePopover = useCallback(() => {
    setTarget(null);
  }, []);

  return (
    <LegendRoot className={className} isVertical={isVertical}>
      {visibleLabels.map((label, index) => {
        const itemIndex = index + sliceIndex;

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
          <LegendLink onClick={handleOpenPopover}>
            And {overflowLength} more
          </LegendLink>
        </LegendLinkContainer>
      )}
      {target && (
        <Popover target={target} onClose={handleClosePopover}>
          <Legend
            labels={labels}
            colors={colors}
            hovered={hovered}
            sliceIndex={overflowIndex}
            sliceLength={overflowLength}
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
