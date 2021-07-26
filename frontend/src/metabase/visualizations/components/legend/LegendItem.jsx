import React, { memo, useCallback } from "react";
import PropTypes from "prop-types";
import {
  LegendItemDescription,
  LegendItemDot,
  LegendItemLabel,
  LegendItemRemoveIcon,
  LegendItemRoot,
  LegendItemTitle,
} from "./LegendItem.styled";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";

const propTypes = {
  title: PropTypes.string.isRequired,
  index: PropTypes.number.isRequired,
  color: PropTypes.string.isRequired,
  description: PropTypes.string,
  isMuted: PropTypes.bool,
  isVertical: PropTypes.bool,
  showDot: PropTypes.bool,
  showTitle: PropTypes.bool,
  showTooltip: PropTypes.bool,
  showDotTooltip: PropTypes.bool,
  infoClassName: PropTypes.string,
  onItemClick: PropTypes.func,
  onItemMouseEnter: PropTypes.func,
  onItemMouseLeave: PropTypes.func,
  onRemoveClick: PropTypes.func,
};

const LegendItem = props => {
  const {
    title,
    index,
    color,
    description,
    isMuted,
    isVertical,
    showDot,
    showTitle,
    showTooltip,
    showDotTooltip,
    infoClassName,
    onItemClick,
    onItemMouseEnter,
    onItemMouseLeave,
    onRemoveClick,
  } = props;

  const handleItemClick = useCallback(
    event => {
      onItemClick && onItemClick(event, index);
    },
    [index, onItemClick],
  );

  const handleItemMouseEnter = useCallback(
    event => {
      onItemMouseEnter && onItemMouseEnter(event, index);
    },
    [index, onItemMouseEnter],
  );

  const handleItemMouseLeave = useCallback(
    event => {
      onItemMouseLeave && onItemMouseLeave(event, index);
    },
    [index, onItemMouseLeave],
  );

  const handleRemoveClick = useCallback(
    event => {
      onRemoveClick && onRemoveClick(event, index);
    },
    [index, onRemoveClick],
  );

  return (
    <LegendItemRoot isVertical={isVertical}>
      <LegendItemLabel
        isMuted={isMuted}
        onClick={handleItemClick}
        onMouseEnter={handleItemMouseEnter}
        onMouseLeave={handleItemMouseLeave}
      >
        {showDot && (
          <Tooltip tooltip={title} isEnabled={showTooltip && showDotTooltip}>
            <LegendItemDot color={color} />
          </Tooltip>
        )}
        {showTitle && (
          <LegendItemTitle showDot={showDot}>
            <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
            {description && (
              <LegendItemDescription>
                <Tooltip tooltip={description} maxWidth="22em">
                  <Icon className={infoClassName} name="info" />
                </Tooltip>
              </LegendItemDescription>
            )}
          </LegendItemTitle>
        )}
      </LegendItemLabel>
      {onRemoveClick && <LegendItemRemoveIcon onClick={handleRemoveClick} />}
    </LegendItemRoot>
  );
};

LegendItem.propTypes = propTypes;

export default memo(LegendItem);
