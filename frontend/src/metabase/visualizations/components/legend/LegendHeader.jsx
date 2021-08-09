import React from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import {
  LegendButtonGroup,
  LegendLabelIcon,
  LegendDescriptionIcon,
  LegendLabel,
  LegendHeaderRoot,
} from "./LegendHeader.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.shape(iconPropTypes),
  actionButtons: PropTypes.node,
  onTitleClick: PropTypes.func,
};

const LegendHeader = ({
  className,
  title,
  description,
  icon,
  actionButtons,
  onTitleClick,
}) => {
  return (
    <LegendHeaderRoot className={className}>
      {icon && <LegendLabelIcon {...icon} />}
      <LegendLabel onClick={onTitleClick}>
        <Ellipsified>{title}</Ellipsified>
      </LegendLabel>
      {description && (
        <Tooltip tooltip={description} maxWidth="22em">
          <LegendDescriptionIcon />
        </Tooltip>
      )}
      {actionButtons && <LegendButtonGroup>{actionButtons}</LegendButtonGroup>}
    </LegendHeaderRoot>
  );
};

LegendHeader.propTypes = propTypes;

export default LegendHeader;
