/* @flow */

import { t } from "c-3po";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { barRenderer } from "../lib/LineAreaBarRenderer";

import {
  GRAPH_DATA_SETTINGS,
  STACKABLE_SETTINGS,
  GRAPH_GOAL_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
} from "../lib/settings/graph";

export default class BarChart extends LineAreaBarChart {
  static uiName = t`Bar`;
  static identifier = "bar";
  static iconName = "bar";
  static noun = t`bar chart`;

  static settings = {
    ...GRAPH_DATA_SETTINGS,
    ...STACKABLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
  };

  static renderer = barRenderer;
}
