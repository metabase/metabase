import React, { Component, PropTypes } from "react";

import CardRenderer from "./CardRenderer.jsx";

import { MinColumnsError, MinRowsError } from "./errors";

export default class LineChart extends Component {
    static displayName = "Line";
    static identifier = "line";
    static iconName = "line";

    static isSensible(cols, rows) {
        return rows.length > 1 && cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
        if (rows.length < 2) { throw new MinRowsError(2, rows.length); }
    }

    render() {
        return (
            <CardRenderer className="flex-full" {...this.props} />
        );
    }
}
