/* @flow */

import React, { Component, PropTypes } from "react";

import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { areaRenderer } from "../lib/LineAreaBarRenderer";

import {
    GRAPH_DATA_SETTINGS,
    LINE_SETTINGS,
    STACKABLE_SETTINGS,
    GRAPH_GOAL_SETTINGS,
    LINE_SETTINGS_2,
    GRAPH_COLORS_SETTINGS,
    GRAPH_AXIS_SETTINGS
} from "../lib/settings/graph";

export default class AreaChart extends LineAreaBarChart {
    static uiName = "Area";
    static identifier = "area";
    static iconName = "area";
    static noun = "area chart";

    static settings = {
        ...GRAPH_DATA_SETTINGS,
        ...LINE_SETTINGS,
        ...STACKABLE_SETTINGS,
        ...GRAPH_GOAL_SETTINGS,
        ...LINE_SETTINGS_2,
        ...GRAPH_COLORS_SETTINGS,
        ...GRAPH_AXIS_SETTINGS
    };

    static renderer = areaRenderer;
}
