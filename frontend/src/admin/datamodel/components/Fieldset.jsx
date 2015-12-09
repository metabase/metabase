import React, { Component, PropTypes } from "react";

export default class Fieldset extends Component {
    static propTypes = {};
    static defaultProps = {};

    render() {
        const { children, legend } = this.props;
        return (
            <fieldset className="px3 pb3 bordered border-brand rounded">
                {legend && <legend className="h5 text-bold text-uppercase bg-white px1" style={{ marginLeft: "-0.5rem" }}>{legend}</legend>}
                {{children}}
            </fieldset>
        );
    }
}
