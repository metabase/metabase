import React, { memo, useCallback } from "react";
import PropTypes from "prop-types";
import {
  LegendItemDot,
  LegendItemLabel,
  LegendItemRemoveIcon,
  LegendItemRoot,
  LegendItemSubtitle,
  LegendItemTitle,
} from "./LegendItem.styled";
import Tooltip from "metabase/components/Tooltip";

const propTypes = {
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
  index: PropTypes.number,
  color: PropTypes.string,
  isMuted: PropTypes.bool,
  isVertical: PropTypes.bool,
  showDot: PropTypes.bool,
  showTooltip: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendItem = ({
  label,
  index,
  color,
  isMuted = false,
  isVertical = false,
  showDot = true,
  showTooltip = false,
  onHoverChange,
  onSelectSeries,
  onRemoveSeries,
}) => {
  const handleItemClick = useCallback(
    event => {
      onSelectSeries && onSelectSeries(event, index);
    },
    [index, onSelectSeries],
  );

  const handleItemMouseEnter = useCallback(
    event => {
      onHoverChange && onHoverChange({ index, element: event.currentTarget });
    },
    [index, onHoverChange],
  );

  const handleItemMouseLeave = useCallback(() => {
    onHoverChange && onHoverChange();
  }, [onHoverChange]);

  const handleRemoveClick = useCallback(
    event => {
      onRemoveSeries && onRemoveSeries(event, index);
    },
    [index, onRemoveSeries],
  );

  return (
    <LegendItemRoot isVertical={isVertical} data-testid="legend-item">
      <Tooltip tooltip={getLabelText(label)} isEnabled={showTooltip}>
        <LegendItemLabel
          isMuted={isMuted}
          onClick={onSelectSeries && handleItemClick}
          onMouseEnter={onHoverChange && handleItemMouseEnter}
          onMouseLeave={onHoverChange && handleItemMouseLeave}
        >
          {showDot && <LegendItemDot color={color} />}
          <LegendItemTitle showDot={showDot} hasSubtitle={hasSubtitle(label)}>
            {getLabelNode(label)}
          </LegendItemTitle>
        </LegendItemLabel>
      </Tooltip>
      {onRemoveSeries && <LegendItemRemoveIcon onClick={handleRemoveClick} />}
    </LegendItemRoot>
  );
};

const hasSubtitle = label => {
  return Array.isArray(label);
};

const getLabelText = label => {
  if (!hasSubtitle(label)) {
    return label;
  }

  return label[0];
};

const getLabelNode = label => {
  if (!hasSubtitle(label)) {
    return label;
  }

  return label.map((text, index) => (
    <LegendItemSubtitle key={index}>{text}</LegendItemSubtitle>
  ));
};

LegendItem.propTypes = propTypes;

export default memo(LegendItem);
