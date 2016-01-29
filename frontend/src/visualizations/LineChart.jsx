import React, { Component, PropTypes } from "react";

export default class LineChart extends Component {
    static displayName = "Line";
    static identifier = "line";
    static iconName = "line";

    static isSensible(cols, rows) {
        return rows.length > 1 && cols.length > 1;
    }

    render() {
        return (
            <div>Line</div>
        );
    }
}
