import React from "react";
import PropTypes from "prop-types";

import { iconPropTypes } from "metabase/components/Icon";

import { BadgeIcon, BadgeText, MaybeLink } from "./Badge.styled";

const iconProp = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.shape(iconPropTypes),
]);

const propTypes = {
  to: PropTypes.string,
  icon: iconProp,
  inactiveColor: PropTypes.string,
  activeColor: PropTypes.string,
  isSingleLine: PropTypes.bool,
  onClick: PropTypes.func,
  children: PropTypes.node,
};

const DEFAULT_ICON_SIZE = 12;

function getIconProps(iconProp) {
  if (!iconProp) {
    return;
  }
  const props = typeof iconProp === "string" ? { name: iconProp } : iconProp;
  if (!props.size && !props.width && !props.height) {
    props.size = DEFAULT_ICON_SIZE;
  }
  return props;
}

function Badge({
  icon,
  inactiveColor = "text-medium",
  activeColor = "brand",
  isSingleLine,
  children,
  ...props
}) {
  return (
    <MaybeLink
      inactiveColor={inactiveColor}
      activeColor={activeColor}
      isSingleLine={isSingleLine}
      {...props}
    >
      {icon && <BadgeIcon {...getIconProps(icon)} $hasMargin={!!children} />}
      {children && (
        <BadgeText className="text-wrap" isSingleLine={isSingleLine}>
          {children}
        </BadgeText>
      )}
    </MaybeLink>
  );
}

Badge.propTypes = propTypes;

export { MaybeLink };

export default Badge;
