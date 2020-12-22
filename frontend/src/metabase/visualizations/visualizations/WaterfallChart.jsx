import { t } from "ttag";
import LineAreaBarChart from "../components/LineAreaBarChart.jsx";
import { waterfallRenderer } from "../lib/LineAreaBarRenderer";
import { assocIn } from "icepick";

import {
  GRAPH_DATA_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";

import { color } from "metabase/lib/colors";

export default class WaterfallChart extends LineAreaBarChart {
  static uiName = t`Waterfall`;
  static identifier = "waterfall";
  static iconName = "waterfall";
  static noun = t`waterfall chart`;

  static settings = {
    ...GRAPH_AXIS_SETTINGS,
    "waterfall.increase_color": {
      section: t`Display`,
      props: { title: t`Increase color` },
      widget: "color",
      default: color("accent1"),
    },
    "waterfall.decrease_color": {
      section: t`Display`,
      props: { title: t`Decrease color` },
      widget: "color",
      default: color("accent3"),
    },
    "waterfall.show_total": {
      section: t`Display`,
      title: t`Show total`,
      widget: "toggle",
      default: true,
    },
    "waterfall.total_color": {
      section: t`Display`,
      props: { title: t`Total color` },
      widget: "color",
      default: color("text-dark"),
      getHidden: (series, vizSettings) =>
        vizSettings["waterfall.show_total"] !== true,
      readDependencies: ["waterfall.show_total"],
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
