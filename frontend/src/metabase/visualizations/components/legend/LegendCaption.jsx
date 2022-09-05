import React from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/core/components/Ellipsified";
import LegendActions from "./LegendActions";
import {
  LegendCaptionRoot,
  LegendDescriptionIcon,
  LegendLabel,
  LegendLabelIcon,
} from "./LegendCaption.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.shape(iconPropTypes),
  actionButtons: PropTypes.node,
  onSelectTitle: PropTypes.func,
};

const LegendCaption = ({
  className,
  title,
  description,
  icon,
  actionButtons,
  onSelectTitle,
}) => {
  return (
    <LegendCaptionRoot className={className} data-testid="legend-caption">
      {icon && <LegendLabelIcon {...icon} />}
      <LegendLabel
        className="fullscreen-normal-text fullscreen-night-text"
        onClick={onSelectTitle}
      >
        <Ellipsified>{title}</Ellipsified>
      </LegendLabel>
      {description && (
        <Tooltip tooltip={description} maxWidth="22em">
          <LegendDescriptionIcon className="hover-child" />
        </Tooltip>
      )}
      {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
    </LegendCaptionRoot>
  );
};

LegendCaption.propTypes = propTypes;

export default LegendCaption;
