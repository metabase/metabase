import React from "react";

import Link from "metabase/components/Link";
import Icon from "metabase/components/Icon";

import cx from "classnames";

export default function Badge({ icon, name, className, children, ...props }) {
  return (
    <MaybeLink
      className={cx(className, "flex align-center text-bold text-medium", {
        "cursor-pointer text-brand-hover": props.to || props.onClick,
      })}
      {...props}
    >
      {icon && <Icon name={icon} mr={children ? "5px" : null} size={11} />}
      {children && <span className="text-wrap">{children}</span>}
    </MaybeLink>
  );
}

export const MaybeLink = ({ to, ...props }) =>
  to ? <Link to={to} {...props} /> : <span {...props} />;
