import React, { Component, PropTypes } from "react";

export default class BarChart extends Component {
    static displayName = "Bar";
    static identifier = "bar";
    static iconName = "bar";

    static isSensible(cols, rows) {
        return cols.length > 1;
    }

    render() {
        return (
            <div>Bar</div>
        );
    }
}
