/* @flow */

import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";
import { rowRenderer } from "./lib/LineAreaBarRenderer";

export default class BarChart extends LineAreaBarChart {
    static uiName = "Row Chart";
    static identifier = "row";
    static iconName = "horizontal_bar";
    static noun = "row chart";

    static supportsSeries = false;

    static renderer = rowRenderer;
}
