import { t } from "ttag";
import { assocIn } from "icepick";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { areaRenderer } from "../lib/LineAreaBarRenderer";

import { GRAPH_GOAL_SETTINGS } from "../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  LINE_SETTINGS,
  STACKABLE_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";

export default class AreaChart extends LineAreaBarChart {
  static uiName = t`Area`;
  static identifier = "area";
  static iconName = "area";
  static noun = t`area chart`;

  static minSize = getMinSize(this.identifier);
  static defaultSize = getDefaultSize(this.identifier);

  static settings = {
    ...LINE_SETTINGS,
    ...STACKABLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  };

  static renderer = areaRenderer;

  static placeholderSeries = assocIn(
    LineAreaBarChart.placeholderSeries,
    [0, "card", "display"],
    "area",
  );

  static onDisplayUpdate = settings => {
    if (settings["stackable.stack_display"]) {
      settings["stackable.stack_display"] = "area";
    }
    return settings;
  };
}
