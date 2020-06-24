/* @flow */

import { t } from "ttag";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { barRenderer } from "../lib/LineAreaBarRenderer";
import { assocIn } from "icepick";

import {
  GRAPH_DATA_SETTINGS,
  STACKABLE_SETTINGS,
  GRAPH_GOAL_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";
import { PLUGIN_CHART_SETTINGS } from "metabase/plugins";

export default class BarChart extends LineAreaBarChart {
  static uiName = t`Bar`;
  static identifier = "bar";
  static iconName = "bar";
  static noun = t`bar chart`;

  static settings = {
    ...STACKABLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...PLUGIN_CHART_SETTINGS,
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  };

  static renderer = barRenderer;

  static placeholderSeries = assocIn(
    LineAreaBarChart.placeholderSeries,
    [0, "card", "display"],
    "bar",
  );
}
