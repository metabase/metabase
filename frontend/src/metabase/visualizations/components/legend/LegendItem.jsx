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
  muted: PropTypes.bool,
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
    muted,
    showDot,
    showTitle,
    showTooltip,
    showDotTooltip,
    infoClassName,
    onClick,
  } = props;

  return (
    <LegendItemRoot muted={muted} onClick={onClick}>
      {showDot && (
        <Tooltip tooltip={title} isEnabled={showTooltip && showDotTooltip}>
          <LegendItemDot color={color} />
        </Tooltip>
      )}
      {showTitle && (
        <LegendItemTitle>
          <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
          <LegendItemDescription>
            <Tooltip tooltip={description} maxWidth="22em">
              <Icon className={infoClassName} name="info" />
            </Tooltip>
          </LegendItemDescription>
        </LegendItemTitle>
      )}
    </LegendItemRoot>
  );
};

LegendItem.propTypes = propTypes;

export default LegendItem;
