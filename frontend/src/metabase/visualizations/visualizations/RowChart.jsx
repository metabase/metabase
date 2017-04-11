/* @flow */


import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { rowRenderer } from "../lib/LineAreaBarRenderer";

import {
    GRAPH_DATA_SETTINGS,
    GRAPH_COLORS_SETTINGS
} from "metabase/visualizations/lib/settings/graph";

export default class RowChart extends LineAreaBarChart {
    static uiName = "Row Chart";
    static identifier = "row";
    static iconName = "horizontal_bar";
    static noun = "row chart";

    static supportsSeries = false;

    static renderer = rowRenderer;

    static settings = {
        ...GRAPH_DATA_SETTINGS,
        ...GRAPH_COLORS_SETTINGS
    }
}

// rename these settings
RowChart.settings["graph.metrics"] = {
    ...RowChart.settings["graph.metrics"],
    title: "X-axis"
}
RowChart.settings["graph.dimensions"] = {
    ...RowChart.settings["graph.dimensions"],
    title: "Y-axis"
}
