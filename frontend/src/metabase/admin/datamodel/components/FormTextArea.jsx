import React, { Component, PropTypes } from "react";

import cx from "classnames";

import { formDomOnlyProps } from "metabase/lib/redux";

export default class FormTextArea extends Component {
    static propTypes = {};

    render() {
        const { field, className, placeholder } = this.props;
        return (
            <textarea
                placeholder={placeholder}
                className={cx("input full text-default h4", { "border-error": !field.active && field.visited && field.invalid }, className)}
                {...formDomOnlyProps(field)}
            />
        );
    }
}
