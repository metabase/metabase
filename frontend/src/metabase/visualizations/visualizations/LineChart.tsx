import { t } from "ttag";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationProperties } from "metabase/visualizations/types";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { lineRenderer } from "../lib/LineAreaBarRenderer";
import { GRAPH_GOAL_SETTINGS } from "../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  LINE_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";

export class LineChart extends LineAreaBarChart {}

Object.assign(LineChart, {
  uiName: t`Line`,
  identifier: "line",
  iconName: "line",
  noun: t`line chart`,

  minSize: getMinSize("line"),
  defaultSize: getDefaultSize("line"),

  settings: {
    ...LINE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  },

  renderer: lineRenderer,
} as VisualizationProperties);
