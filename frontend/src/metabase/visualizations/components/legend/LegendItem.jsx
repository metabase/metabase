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
  showDot: PropTypes.bool,
  showTitle: PropTypes.bool,
  showTooltip: PropTypes.bool,
  showDotTooltip: PropTypes.bool,
  infoClassName: PropTypes.string,
  onLabelClick: PropTypes.func,
  onLabelMouseEnter: PropTypes.func,
  onLabelMouseLeave: PropTypes.func,
  onRemoveClick: PropTypes.func,
};

const LegendItem = props => {
  const {
    title,
    index,
    color,
    description,
    isMuted = false,
    showDot = true,
    showTitle = true,
    showTooltip = true,
    showDotTooltip = true,
    infoClassName,
    onLabelClick,
    onLabelMouseEnter,
    onLabelMouseLeave,
    onRemoveClick,
  } = props;

  const handleLabelClick = useCallback(
    event => {
      onLabelClick && onLabelClick(event, index);
    },
    [index, onLabelClick],
  );

  const handleLabelMouseEnter = useCallback(
    event => {
      onLabelMouseEnter && onLabelMouseEnter(event, index);
    },
    [index, onLabelMouseEnter],
  );

  const handleLabelMouseLeave = useCallback(
    event => {
      onLabelMouseLeave && onLabelMouseLeave(event, index);
    },
    [index, onLabelMouseLeave],
  );

  const handleRemoveClick = useCallback(
    event => {
      onRemoveClick && onRemoveClick(event, index);
    },
    [index, onRemoveClick],
  );

  return (
    <LegendItemRoot>
      <LegendItemLabel
        isMuted={isMuted}
        onClick={handleLabelClick}
        onMouseEnter={handleLabelMouseEnter}
        onMouseLeave={handleLabelMouseLeave}
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
      <LegendItemRemoveIcon onClick={handleRemoveClick} />
    </LegendItemRoot>
  );
};

LegendItem.propTypes = propTypes;

export default memo(LegendItem);
