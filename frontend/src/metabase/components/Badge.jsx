import React from "react";
import PropTypes from "prop-types";

import { iconPropTypes } from "metabase/components/Icon";

import { BadgeIcon, MaybeLink } from "./Badge.styled";

const iconProp = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.shape(iconPropTypes),
]);

const propTypes = {
  to: PropTypes.string,
  icon: iconProp,
  inactiveColor: PropTypes.string,
  activeColor: PropTypes.string,
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
  children,
  ...props
}) {
  return (
    <MaybeLink
      inactiveColor={inactiveColor}
      activeColor={activeColor}
      {...props}
    >
      {icon && <BadgeIcon {...getIconProps(icon)} $hasMargin={!!children} />}
      {children && <span className="text-wrap">{children}</span>}
    </MaybeLink>
  );
}

Badge.propTypes = propTypes;

export { MaybeLink };

export default Badge;
