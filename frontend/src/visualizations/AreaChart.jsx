import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

import { MinColumnsError } from "./errors";

export default class AreaChart extends Component {
    static displayName = "Area";
    static identifier = "area";
    static iconName = "area";

    static noHeader = true;
    static supportsSeries = true;

    static isSensible(cols, rows) {
        return cols.length > 1;
    }

    static checkRenderable(cols, rows) {
        if (cols.length < 2) { throw new MinColumnsError(2, cols.length); }
    }

    render() {
        return <LineAreaBarChart {...this.props} chartType="area" />;
    }
}
