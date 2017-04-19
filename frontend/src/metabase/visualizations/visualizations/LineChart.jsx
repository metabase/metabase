/* @flow */


import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { lineRenderer } from "../lib/LineAreaBarRenderer";

import {
    GRAPH_DATA_SETTINGS,
    LINE_SETTINGS,
    GRAPH_GOAL_SETTINGS,
    LINE_SETTINGS_2,
    GRAPH_COLORS_SETTINGS,
    GRAPH_AXIS_SETTINGS
} from "../lib/settings/graph";

export default class LineChart extends LineAreaBarChart {
    static uiName = "Line";
    static identifier = "line";
    static iconName = "line";
    static noun = "line chart";

    static settings = {
        ...GRAPH_DATA_SETTINGS,
        ...LINE_SETTINGS,
        ...GRAPH_GOAL_SETTINGS,
        ...LINE_SETTINGS_2,
        ...GRAPH_COLORS_SETTINGS,
        ...GRAPH_AXIS_SETTINGS
    };

    static renderer = lineRenderer;
}
