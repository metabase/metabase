import React from "react";

import Icon from "metabase/components/Icon";
import { color as c, alpha } from "metabase/lib/colors";
import cx from "classnames";

export default function ViewPill({
  className,
  style = {},
  color = c("brand"),
  invert,
  children,
  onClick,
  onRemove,
  icon,
  ...props
}) {
  return (
    <span
      {...props}
      className={cx("rounded flex align-center text-bold", className, {
        "cursor-pointer": onClick,
      })}
      style={{
        height: 22,
        paddingLeft: icon ? 5 : 8,
        paddingRight: children ? 8 : 5,
        ...(invert
          ? { backgroundColor: color, color: "white" }
          : { backgroundColor: alpha(color, 0.2), color: color }),
        ...style,
      }}
      onClick={onClick}
    >
      {icon && (
        <Icon name={icon} size={12} className={cx({ mr1: !!children })} />
      )}
      {children}
      {onRemove && (
        <Icon
          name="close"
          size={12}
          className="ml1"
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </span>
  );
}
