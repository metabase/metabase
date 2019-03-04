import React from "react";
import PropTypes from "prop-types";
import sys from "system-components";

import Icon from "metabase/components/Icon.jsx";
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
  "borderless",
  "onlyIcon",
];

const BaseButton = ({
  className,
  icon,
  iconRight,
  iconSize,
  iconColor,
  children,
  ...props
}) => {
  let variantClasses = BUTTON_VARIANTS.filter(variant => props[variant]).map(
    variant => "Button--" + variant,
  );

  const onlyIcon = !children;

  return (
    <button
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx("Button", className, variantClasses)}
    >
      <div className="flex layout-centered">
        {icon && (
          <Icon
            color={iconColor}
            name={icon}
            size={iconSize ? iconSize : 14}
            className={cx({ mr1: !onlyIcon })}
          />
        )}
        <div>{children}</div>
        {iconRight && (
          <Icon
            color={iconColor}
            name={iconRight}
            size={iconSize ? iconSize : 14}
            className={cx({ ml1: !onlyIcon })}
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
