import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";

import { MinColumnsError } from "./errors";

export default class BarChart extends Component {
    static displayName = "Bar";
    static identifier = "bar";
    static iconName = "bar";

    static isSensible(cols, rows) {
        return cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    render() {
        return (
            <CardRenderer className="flex-full" {...this.props} />
        );
    }
}
