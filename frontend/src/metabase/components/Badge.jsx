import React from "react";
import PropTypes from "prop-types";

import { BadgeIcon, MaybeLink } from "./Badge.styled";

const propTypes = {
  name: PropTypes.string.isRequired,
  to: PropTypes.string,
  icon: PropTypes.shape({
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }),
  onClick: PropTypes.func,
  children: PropTypes.node,
};

const DEFAULT_ICON_SIZE = 12;

function Badge({ name, icon, children, ...props }) {
  const extraIconProps = {};
  if (icon && !icon.size && !icon.width && !icon.height) {
    extraIconProps.size = DEFAULT_ICON_SIZE;
  }
  return (
    <MaybeLink {...props}>
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
