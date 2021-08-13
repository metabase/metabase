import React from "react";
import PropTypes from "prop-types";

import { iconPropTypes } from "metabase/components/Icon";

import { BadgeIcon, MaybeLink } from "./Badge.styled";

const propTypes = {
  name: PropTypes.string.isRequired,
  to: PropTypes.string,
  icon: PropTypes.shape(iconPropTypes),
  activeColor: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node,
};

const DEFAULT_ICON_SIZE = 12;

function Badge({ name, icon, activeColor = "brand", children, ...props }) {
  const extraIconProps = {};
  if (icon && !icon.size && !icon.width && !icon.height) {
    extraIconProps.size = DEFAULT_ICON_SIZE;
  }
  return (
    <MaybeLink activeColor={activeColor} {...props}>
      {icon && (
        <BadgeIcon {...icon} {...extraIconProps} hasMargin={!!children} />
      )}
      {children && <span className="text-wrap">{children}</span>}
    </MaybeLink>
  );
}

Badge.propTypes = propTypes;

export { MaybeLink };

export default Badge;
