import React, { Component, PropTypes } from "react";

export default class AreaChart extends Component {
    static displayName = "Area";
    static identifier = "area";
    static iconName = "area";

    static isSensible(cols, rows) {
        return rows.length > 1 && cols.length > 1;
    }

    render() {
        return (
            <div>Area</div>
        );
    }
}
