import React from "react";
import PropTypes from "prop-types";
import {
  LegendItemDescription,
  LegendItemDot,
  LegendItemRoot,
  LegendItemTitle,
} from "./LegendItem.styled";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";

const propTypes = {
  title: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  description: PropTypes.string,
  isMuted: PropTypes.bool,
  showDot: PropTypes.bool,
  showTitle: PropTypes.bool,
  showTooltip: PropTypes.bool,
  showDotTooltip: PropTypes.bool,
  infoClassName: PropTypes.string,
  onClick: PropTypes.func,
};

const LegendItem = props => {
  const {
    title,
    color,
    description,
    isMuted = false,
    showDot = true,
    showTitle = true,
    showTooltip = true,
    showDotTooltip = true,
    infoClassName,
    onClick,
  } = props;

  return (
    <LegendItemRoot isMuted={isMuted} onClick={onClick}>
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
    </LegendItemRoot>
  );
};

LegendItem.propTypes = propTypes;

export default LegendItem;
