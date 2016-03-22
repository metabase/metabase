import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

export default class BarChart extends LineAreaBarChart {
    static displayName = "Bar";
    static identifier = "bar";
    static iconName = "bar";
}
