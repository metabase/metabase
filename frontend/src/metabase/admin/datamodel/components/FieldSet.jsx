import React, { Component, PropTypes } from "react";

export default class FieldSet extends Component {
    static propTypes = {};
    static defaultProps = {
        border: "border-brand"
    };

    render() {
        const { children, legend, border } = this.props;
        return (
            <fieldset className={"px2 pb2 bordered rounded " + border}>
                {legend && <legend className="h5 text-bold text-uppercase px1" style={{ marginLeft: "-0.5rem" }}>{legend}</legend>}
                {children}
            </fieldset>
        );
    }
}
