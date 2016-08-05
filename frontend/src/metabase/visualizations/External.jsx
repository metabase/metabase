import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import { CrossOriginFrame } from "react-framed";

export default class External extends Component {
    static displayName = "External";
    static identifier = "external";
    static iconName = "number";

    static noHeader = true;
    static supportsSeries = true;

    static isSensible = () => true;

    render() {
        const { settings, style, className } = this.props;
        return (
            <CrossOriginFrame
                src={settings["custom.external.url"]}
                style={style} className={className}
                series={this.props.series} settings={this.props.settings}
            />
        );
    }
}
