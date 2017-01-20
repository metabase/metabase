/* @flow */

import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "./components/LineAreaBarChart.jsx";

export default class BarChart extends LineAreaBarChart {
    static uiName = "Bar";
    static identifier = "bar";
    static iconName = "bar";
    static noun = "bar chart";
}
