import { t } from "ttag";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { waterfallRenderer } from "../lib/LineAreaBarRenderer";
import { assocIn } from "icepick";

import {
  GRAPH_DATA_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";

export default class WaterfallChart extends LineAreaBarChart {
  static uiName = t`Waterfall`;
  static identifier = "waterfall";
  static iconName = "waterfall";
  static noun = t`waterfall chart`;

  static settings = {
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    "waterfall.show_total": {
      section: t`Display`,
      title: t`Show total`,
      widget: "toggle",
      default: true,
    },
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
  };

  static renderer = waterfallRenderer;

  static placeholderSeries = assocIn(
    LineAreaBarChart.placeholderSeries,
    [0, "card", "display"],
    "waterfall",
  );
}
