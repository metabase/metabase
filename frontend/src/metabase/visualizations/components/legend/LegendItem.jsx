import React, { memo } from "react";
import PropTypes from "prop-types";
import {
  LegendItemDot,
  LegendItemLabel,
  LegendItemRemoveIcon,
  LegendItemRoot,
  LegendItemTitle,
} from "./LegendItem.styled";
import Ellipsified from "metabase/components/Ellipsified";
import Tooltip from "metabase/components/Tooltip";

const propTypes = {
  label: PropTypes.string,
  index: PropTypes.number,
  color: PropTypes.string,
  isMuted: PropTypes.bool,
  isNarrow: PropTypes.bool,
  isVertical: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendItem = ({
  label,
  index,
  color,
  isMuted,
  isNarrow,
  isVertical,
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
}) => {
  const handleItemClick = event => {
    onSelectSeries && onSelectSeries(event, index);
  };

  const handleItemMouseEnter = event => {
    onHoverChange && onHoverChange({ index, element: event.currentTarget });
  };

  const handleItemMouseLeave = () => {
    onHoverChange && onHoverChange();
  };

  const handleRemoveClick = event => {
    onRemoveSeries && onRemoveSeries(event, index);
  };

  return (
    <LegendItemRoot
      isNarrow={isNarrow}
      isVertical={isVertical}
      data-testid="legend-item"
    >
      <Tooltip tooltip={label}>
        <LegendItemLabel
          isMuted={isMuted}
          onClick={onSelectSeries && handleItemClick}
          onMouseEnter={onHoverChange && handleItemMouseEnter}
          onMouseLeave={onHoverChange && handleItemMouseLeave}
        >
          <LegendItemDot color={color} />
          {!isNarrow && (
            <LegendItemTitle>
              <Ellipsified>{label}</Ellipsified>
            </LegendItemTitle>
          )}
        </LegendItemLabel>
      </Tooltip>
      {onRemoveSeries && <LegendItemRemoveIcon onClick={handleRemoveClick} />}
    </LegendItemRoot>
  );
};

LegendItem.propTypes = propTypes;

export default memo(LegendItem);
