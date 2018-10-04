/* @flow */

import { t } from "c-3po";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { comboRenderer } from "../lib/LineAreaBarRenderer";

import {
  GRAPH_DATA_SETTINGS,
  LINE_SETTINGS,
  GRAPH_GOAL_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
} from "../lib/settings/graph";

export default class LineChart extends LineAreaBarChart {
  static uiName = t`Line + Bar`;
  static identifier = "combo";
  static iconName = "lineandbar";
  static noun = t`line and bar chart`;

  static settings = {
    ...GRAPH_DATA_SETTINGS,
    ...LINE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
  };

  static renderer = comboRenderer;
}
