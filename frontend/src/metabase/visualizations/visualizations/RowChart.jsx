import { t } from "ttag";

import {
  GRAPH_DATA_SETTINGS,
  GRAPH_COLORS_SETTINGS,
} from "metabase/visualizations/lib/settings/graph";

import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import rowRenderer from "../lib/RowRenderer.js";

export default class RowChart extends LineAreaBarChart {
  static uiName = t`Row`;
  static identifier = "row";
  static iconName = "horizontal_bar";
  static noun = t`row chart`;

  static maxMetricsSupported = 1;
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
