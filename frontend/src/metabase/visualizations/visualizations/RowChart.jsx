/* @flow */

import { t } from "ttag";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import rowRenderer from "../lib/RowRenderer.js";

import {
  GRAPH_DATA_SETTINGS,
  GRAPH_COLORS_SETTINGS,
} from "metabase/visualizations/lib/settings/graph";

export default class RowChart extends LineAreaBarChart {
  static uiName = t`Row`;
  static identifier = "row";
  static iconName = "horizontal_bar";
  static noun = t`row chart`;

  static supportsSeries = false;

  static renderer = rowRenderer;

  static settings = {
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  };
}

// rename these settings
RowChart.settings["graph.metrics"] = {
  ...RowChart.settings["graph.metrics"],
  title: t`X-axis`,
};
RowChart.settings["graph.dimensions"] = {
  ...RowChart.settings["graph.dimensions"],
  title: t`Y-axis`,
};
