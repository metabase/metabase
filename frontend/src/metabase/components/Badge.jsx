import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Link from "metabase/components/Link";
import Icon from "metabase/components/Icon";

const badgePropTypes = {
  name: PropTypes.string.isRequired,
  to: PropTypes.string,
  icon: PropTypes.string,
  iconColor: PropTypes.string,
  onClick: PropTypes.func,
  className: PropTypes.string,
  children: PropTypes.node,
};

export default function Badge({
  icon,
  iconColor,
  name,
  className,
  children,
  to,
  onClick,
  ...props
}) {
  return (
    <MaybeLink
      className={cx(
        className,
        "flex align-center text-small text-bold text-medium",
        {
          "cursor-pointer text-brand-hover": to || onClick,
        },
      )}
      {...props}
    >
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

Badge.propTypes = badgePropTypes;

const maybeLinkPropTypes = {
  to: PropTypes.string,
};

export const MaybeLink = ({ to, ...props }) =>
  to ? <Link to={to} {...props} /> : <span {...props} />;

MaybeLink.propTypes = maybeLinkPropTypes;
