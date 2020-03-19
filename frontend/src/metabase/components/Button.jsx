import React from "react";
import PropTypes from "prop-types";
import sys from "system-components";

import Icon from "metabase/components/Icon";
import cx from "classnames";
import _ from "underscore";

const BUTTON_VARIANTS = [
  "small",
  "medium",
  "large",
  "round",
  "primary",
  "danger",
  "warning",
  "cancel",
  "success",
  "purple",
  "white",
  "borderless",
  "onlyIcon",
];

const BaseButton = ({
  className,
  icon,
  iconRight,
  iconSize,
  iconColor,
  iconVertical,
  labelBreakpoint,
  color,
  children,
  ...props
}) => {
  const variantClasses = BUTTON_VARIANTS.filter(variant => props[variant]).map(
    variant => "Button--" + variant,
  );

  return (
    <button
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx("Button", className, "flex-no-shrink", variantClasses, {
        p1: !children,
      })}
    >
      <div
        className={cx("flex layout-centered", { "flex-column": iconVertical })}
        style={iconVertical ? { minWidth: 60 } : null}
      >
        {icon && (
          <Icon color={iconColor} name={icon} size={iconSize ? iconSize : 14} />
        )}
        {children && (
          <div
            className={cx({
              [iconVertical ? "mt1" : "ml1"]: icon,
              [iconVertical ? "mb1" : "mr1"]: iconRight,
              [`hide ${labelBreakpoint}-show`]: !!labelBreakpoint,
            })}
          >
            {children}
          </div>
        )}
        {iconRight && (
          <Icon
            color={iconColor}
            name={iconRight}
            size={iconSize ? iconSize : 14}
          />
        )}
      </div>
    </button>
  );
};

BaseButton.propTypes = {
  className: PropTypes.string,
  icon: PropTypes.string,
  iconSize: PropTypes.number,
  children: PropTypes.any,

  small: PropTypes.bool,
  medium: PropTypes.bool,
  large: PropTypes.bool,

  primary: PropTypes.bool,
  warning: PropTypes.bool,
  cancel: PropTypes.bool,
  purple: PropTypes.bool,

  borderless: PropTypes.bool,
};

const Button = sys(
  {
    is: BaseButton,
  },
  "space",
  "color",
);

Button.displayName = "Button";

export default Button;
