import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

export default class LineChart extends LineAreaBarChart {
    static displayName = "Line";
    static identifier = "line";
    static iconName = "line";
}
