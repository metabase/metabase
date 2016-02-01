import React, { Component, PropTypes } from "react";

import { MinColumnsError, MinRowsError } from "./errors";

import CardRenderer from "./CardRenderer.jsx";

export default class AreaChart extends Component {
    static displayName = "Area";
    static identifier = "area";
    static iconName = "area";

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
