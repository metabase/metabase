import React, { Component, PropTypes } from "react";

import cx from "classnames";

export default class FormInput extends Component {
    static propTypes = {};

    render() {
        const { field, className } = this.props;
        return (
            <input
                {...this.props}
                className={cx("input full text-default h4", { "border-error": !field.active && field.visited && field.invalid }, className)}
                {...field}
            />
        );
    }
}
