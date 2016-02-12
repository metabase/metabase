import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

import { MinColumnsError, MinRowsError } from "./errors";

export default class LineChart extends Component {
    static displayName = "Line";
    static identifier = "line";
    static iconName = "line";

    static noHeader = true;
    static supportsSeries = true;

    static isSensible(cols, rows) {
        return rows.length > 1 && cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
        if (rows.length < 2) { throw new MinRowsError(2, rows.length); }
    }

    render() {
        return <LineAreaBarChart {...this.props} chartType="line" />;
    }
}
