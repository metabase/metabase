import { t } from "ttag";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationProperties } from "metabase/visualizations/types";
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

export class ScatterPlot extends LineAreaBarChart {}

Object.assign(ScatterPlot, {
  uiName: t`Scatter`,
  identifier: "scatter",
  iconName: "bubble",
  noun: t`scatter plot`,

  minSize: getMinSize("scatter"),
  defaultSize: getDefaultSize("scatter"),

  renderer: scatterRenderer,

  settings: {
    ...GRAPH_BUBBLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  },
} as VisualizationProperties);
