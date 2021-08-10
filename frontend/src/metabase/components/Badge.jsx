import React from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";

import { MaybeLink } from "./Badge.styled";

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
        <Icon
          name={icon}
          mr={children ? "5px" : null}
          color={iconColor}
          size={12}
        />
      )}
      {children && <span className="text-wrap">{children}</span>}
    </MaybeLink>
  );
}

Badge.propTypes = propTypes;

export default Badge;
