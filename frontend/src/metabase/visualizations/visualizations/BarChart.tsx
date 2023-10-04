import { t } from "ttag";
import { assocIn } from "icepick";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationProperties } from "metabase/visualizations/types";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { barRenderer } from "../lib/LineAreaBarRenderer";
import { GRAPH_GOAL_SETTINGS } from "../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  STACKABLE_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";

export class BarChart extends LineAreaBarChart {}

Object.assign(BarChart, {
  uiName: t`Bar`,
  identifier: "bar",
  iconName: "bar",
  noun: t`bar chart`,

  minSize: getMinSize("bar"),
  defaultSize: getDefaultSize("bar"),

  settings: {
    ...STACKABLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  },

  renderer: barRenderer,

  placeholderSeries: assocIn(
    LineAreaBarChart.placeholderSeries,
    [0, "card", "display"],
    "bar",
  ),

  onDisplayUpdate: settings => {
    if (settings["stackable.stack_display"]) {
      settings["stackable.stack_display"] = "bar";
    }
    return settings;
  },
} as VisualizationProperties);
