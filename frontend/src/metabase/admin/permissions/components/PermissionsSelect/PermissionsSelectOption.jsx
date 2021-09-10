import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";

import {
  IconContainer,
  PermissionsSelectOptionRoot,
  PermissionsSelectLabel,
} from "./PermissionsSelectOption.styled";

export const optionShape = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  iconColor: PropTypes.string.isRequired,
};

const propTypes = {
  ...optionShape,
  className: PropTypes.string,
};

export function PermissionsSelectOption({ label, icon, iconColor, className }) {
  return (
    <PermissionsSelectOptionRoot className={className}>
      <IconContainer color={iconColor}>
        <Icon name={icon} size={14} />
      </IconContainer>
      <PermissionsSelectLabel>{label}</PermissionsSelectLabel>
    </PermissionsSelectOptionRoot>
  );
}

PermissionsSelectOption.propTypes = propTypes;
