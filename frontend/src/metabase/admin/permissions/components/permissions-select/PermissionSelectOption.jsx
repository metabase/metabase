import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";

import {
  IconContainer,
  PermissionSelectOptionRoot,
  PermissionSelectLabel,
} from "./PermissionSelectOption.styled";

const propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.string.isRequired,
  iconColor: PropTypes.string.isRequired,
  className: PropTypes.string,
};

export function PermissionSelectOption({ label, icon, iconColor, className }) {
  return (
    <PermissionSelectOptionRoot className={className}>
      <IconContainer color={iconColor}>
        <Icon name={icon} size={14} />
      </IconContainer>
      <PermissionSelectLabel>{label}</PermissionSelectLabel>
    </PermissionSelectOptionRoot>
  );
}

PermissionSelectOption.propTypes = propTypes;
