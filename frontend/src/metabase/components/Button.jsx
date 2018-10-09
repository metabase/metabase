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
  children,
  ...props
}) => {
  let variantClasses = BUTTON_VARIANTS.filter(variant => props[variant]).map(
    variant => "Button--" + variant,
  );

  return (
    <button
      {..._.omit(props, ...BUTTON_VARIANTS)}
      className={cx("Button", className, variantClasses)}
    >
      <div className="flex layout-centered">
        {icon && (
          <Icon
            name={icon}
            size={iconSize ? iconSize : 14}
            className={cx({ mr1: !props.onlyIcon })}
          />
        )}
        <div>{children}</div>
        {iconRight && (
          <Icon
            name={iconRight}
            size={iconSize ? iconSize : 14}
            className={cx({ ml1: !props.onlyIcon })}
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
  onlyIcon: PropTypes.bool,
};

const Button = sys(
  {
    is: BaseButton,
  },
  "space",
  "color",
);

export default Button;
