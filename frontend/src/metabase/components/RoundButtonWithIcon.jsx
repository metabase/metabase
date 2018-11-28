import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";

const RoundButtonWithIcon = ({
  icon,
  className,
  style = {},
  children,
  size = 36,
  ...props
}) => (
  <span
    className={cx("circular cursor-pointer inline-block", className)}
    style={{ width: children ? undefined : size, height: size, ...style }}
    {...props}
  >
    <span className="flex layout-centered full-height">
      {icon && <Icon name={icon} className={cx({ ml1: children })} />}
      {children && <span className="mx1">{children}</span>}
    </span>
  </span>
);

export default RoundButtonWithIcon;
