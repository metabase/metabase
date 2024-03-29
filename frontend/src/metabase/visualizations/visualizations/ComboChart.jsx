import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { comboRenderer } from "../lib/LineAreaBarRenderer";
import { GRAPH_GOAL_SETTINGS } from "../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  LINE_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";

export default class LineChart extends LineAreaBarChart {
  static uiName = t`Combo`;
  static identifier = "combo";
  static iconName = "lineandbar";
  static noun = t`line and bar chart`;

  static minSize = getMinSize("combo");
  static defaultSize = getDefaultSize("combo");

  static settings = {
    ...LINE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  };

  static renderer = comboRenderer;
}
