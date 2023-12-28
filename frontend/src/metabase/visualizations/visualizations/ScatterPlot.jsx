import { t } from "ttag";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { scatterRenderer } from "../lib/LineAreaBarRenderer";
import { GRAPH_GOAL_SETTINGS } from "../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  GRAPH_BUBBLE_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
} from "../lib/settings/graph";

export default class ScatterPlot extends LineAreaBarChart {
  static uiName = t`Scatter`;
  static identifier = "scatter";
  static iconName = "bubble";
  static noun = t`scatter plot`;

  static minSize = getMinSize("scatter");
  static defaultSize = getDefaultSize("scatter");

  static renderer = scatterRenderer;

  static settings = {
    ...GRAPH_BUBBLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  };
}
