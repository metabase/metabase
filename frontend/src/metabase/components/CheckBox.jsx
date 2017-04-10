import React, { Component } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class CheckBox extends Component {
    static propTypes = {
        checked: PropTypes.bool,
        onChange: PropTypes.func
    };

    static defaultProps = {
        size: 16,
        padding: 2,
        borderColor: "#ddd",
        checkColor: "currentColor"
    };

    onClick() {
        if (this.props.onChange) {
            // TODO: use a proper event object?
            this.props.onChange({ target: { checked: !this.props.checked }})
        }
    }

    render() {
        const { checked, size, padding, borderColor, checkColor, className, invertChecked, style } = this.props;
        const checkboxStyle = {
            width:              size,
            height:             size,
            backgroundColor:    (invertChecked && checked) ? checkColor : "white",
            border:             (invertChecked && checked) ? ("2px solid " + checkColor) : ("2px solid " + borderColor),
            borderRadius:       4,
            display:            "flex",
            alignItems:         "center",
            justifyContent:     "center",
        };
        return (
            <div style={style} className={cx("cursor-pointer", className)} onClick={() => this.onClick()}>
                <div style={checkboxStyle}>
                    { checked ? <Icon style={{ color: invertChecked ? "white" : checkColor }} name="check"  size={size - padding * 2} /> : null }
                </div>
            </div>
        )
    }
}
