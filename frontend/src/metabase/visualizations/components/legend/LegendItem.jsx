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
import Ellipsified from "metabase/components/Ellipsified";

const propTypes = {
  title: PropTypes.oneOfType(PropTypes.string, PropTypes.array),
  index: PropTypes.number,
  color: PropTypes.string,
  isMuted: PropTypes.bool,
  isVertical: PropTypes.bool,
  showDot: PropTypes.bool,
  showTitle: PropTypes.bool,
  showTooltip: PropTypes.bool,
  showDotTooltip: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendItem = ({
  title,
  index,
  color,
  isMuted = false,
  isVertical = false,
  showDot = true,
  showTitle = true,
  showTooltip = false,
  showDotTooltip = false,
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
    <LegendItemRoot isVertical={isVertical}>
      <LegendItemLabel
        isMuted={isMuted}
        onClick={onSelectSeries && handleItemClick}
        onMouseEnter={onHoverChange && handleItemMouseEnter}
        onMouseLeave={onHoverChange && handleItemMouseLeave}
      >
        {showDot && (
          <Tooltip
            tooltip={getTitleText(title)}
            isEnabled={showTooltip && showDotTooltip}
          >
            <LegendItemDot color={color} />
          </Tooltip>
        )}
        {showTitle && (
          <LegendItemTitle showDot={showDot}>
            {isVertical && getTitleNodes(title)}
            {!isVertical && (
              <Ellipsified showTooltip={showTooltip}>
                {getTitleNodes(title)}
              </Ellipsified>
            )}
          </LegendItemTitle>
        )}
      </LegendItemLabel>
      {onRemoveSeries && <LegendItemRemoveIcon onClick={handleRemoveClick} />}
    </LegendItemRoot>
  );
};

const getTitleText = title => {
  if (!Array.isArray(title)) {
    return title;
  }

  return title[0];
};

const getTitleNodes = title => {
  if (!Array.isArray(title)) {
    return title;
  }

  return title.map((text, index) => (
    <LegendItemSubtitle key={index}>{text}</LegendItemSubtitle>
  ));
};

LegendItem.propTypes = propTypes;

export default memo(LegendItem);
