import React from "react";
import PropTypes from "prop-types";

import { BadgeIcon, MaybeLink } from "./Badge.styled";

const propTypes = {
  name: PropTypes.string.isRequired,
  to: PropTypes.string,
  icon: PropTypes.string,
  iconColor: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node,
};

function Badge({ name, icon, iconColor, children, ...props }) {
  return (
    <MaybeLink {...props}>
      {icon && (
        <BadgeIcon name={icon} color={iconColor} hasMargin={!!children} />
      )}
      {children && <span className="text-wrap">{children}</span>}
    </MaybeLink>
  );
}

Badge.propTypes = propTypes;

export default Badge;
