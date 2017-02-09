/* @flow */

import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";
import { areaRenderer } from "./lib/LineAreaBarRenderer";

export default class AreaChart extends LineAreaBarChart {
    static uiName = "Area";
    static identifier = "area";
    static iconName = "area";
    static noun = "area chart";

    static renderer = areaRenderer;
}
