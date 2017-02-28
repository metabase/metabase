/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const SelectButton = ({ className, children, hasValue = true }) =>
    <div className={cx(className, "AdminSelect flex align-center", { "text-grey-3": !hasValue })}>
        <span className="mr1">{children}</span>
        <Icon className="flex-align-right" name="chevrondown" size={12} />
    </div>

SelectButton.propTypes = {
    className: PropTypes.string,
    children: PropTypes.any,
    hasValue: PropTypes.any
};

export default SelectButton;
