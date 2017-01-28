/* @flow */

import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

export default class ScatterPlot extends LineAreaBarChart {
    static uiName = "Scatter";
    static identifier = "scatter";
    static iconName = "bubble";
    static noun = "scatter plot";
}
