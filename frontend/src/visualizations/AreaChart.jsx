import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

export default class AreaChart extends LineAreaBarChart {
    static displayName = "Area";
    static identifier = "area";
    static iconName = "area";
}
