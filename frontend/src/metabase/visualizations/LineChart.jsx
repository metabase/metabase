/* @flow */

import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";
import { lineRenderer } from "./lib/LineAreaBarRenderer";

export default class LineChart extends LineAreaBarChart {
    static uiName = "Line";
    static identifier = "line";
    static iconName = "line";
    static noun = "line chart";

    static renderer = lineRenderer;
}
