import React, { Component, PropTypes } from "react";

import cx from "classnames";

export default class FieldSet extends Component {
    static propTypes = {};
    static defaultProps = {
        className: "border-brand"
    };

    render() {
        const { className, children, legend } = this.props;
        return (
            <fieldset className={cx(className, "px2 pb2 bordered rounded")}>
                {legend && <legend className="h5 text-bold text-uppercase px1" style={{ marginLeft: "-0.5rem" }}>{legend}</legend>}
                {children}
            </fieldset>
        );
    }
}
