import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

import _ from "underscore";

const BUTTON_VARIANTS = [
    "small",
    "medium",
    "large",
    "primary",
    "warning",
    "cancel",
    "purple",
    "borderless"
];

const Button = ({ className, icon, children, ...props }) => {
    let variantClasses = BUTTON_VARIANTS.filter(variant => props[variant]).map(variant => "Button--" + variant);
    return (
        <button
            {..._.omit(props, ...variantClasses)}
            className={cx("Button", className, variantClasses)}
        >
            <div className="flex layout-centered">
                { icon && <Icon name={icon} size={14} className="mr1" />}
                <div>{children}</div>
            </div>
        </button>
    );
}

Button.propTypes = {
    className: PropTypes.string,
    icon: PropTypes.string,
    children: PropTypes.any,

    small: PropTypes.bool,
    medium: PropTypes.bool,
    large: PropTypes.bool,

    primary: PropTypes.bool,
    warning: PropTypes.bool,
    cancel: PropTypes.bool,
    purple: PropTypes.bool,

    borderless: PropTypes.bool
};

export default Button;
