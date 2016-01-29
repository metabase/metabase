import React, { Component, PropTypes } from "react";

export default class PieChart extends Component {
    static displayName = "Pie";
    static identifier = "pie";
    static iconName = "pie";

    static isSensible(cols, rows) {
        return cols.length > 1;
    }

    render() {
        return (
            <div>Pie Chart</div>
        );
    }
}
