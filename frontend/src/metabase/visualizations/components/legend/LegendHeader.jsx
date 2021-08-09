import React from "react";
import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import {
  LegendHeaderButtonGroup,
  LegendHeaderIcon,
  LegendHeaderInfo,
  LegendHeaderLabel,
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
      {icon && <LegendHeaderIcon {...icon} />}
      <LegendHeaderLabel onClick={onTitleClick}>
        <Ellipsified>{title}</Ellipsified>
      </LegendHeaderLabel>
      {description && (
        <Tooltip tooltip={description} maxWidth="22em">
          <LegendHeaderInfo />
        </Tooltip>
      )}
      {actionButtons && (
        <LegendHeaderButtonGroup>{actionButtons}</LegendHeaderButtonGroup>
      )}
    </LegendHeaderRoot>
  );
};

LegendHeader.propTypes = propTypes;

export default LegendHeader;
