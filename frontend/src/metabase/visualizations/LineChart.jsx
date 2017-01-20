/* @flow */

import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

export default class LineChart extends LineAreaBarChart {
    static uiName = "Line";
    static identifier = "line";
    static iconName = "line";
    static noun = "line chart";
}
