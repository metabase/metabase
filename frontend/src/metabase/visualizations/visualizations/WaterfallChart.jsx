import { t } from "ttag";
import { assocIn } from "icepick";
import { color } from "metabase/lib/colors";
import LineAreaBarChart from "../components/LineAreaBarChart";
import { waterfallRenderer } from "../lib/LineAreaBarRenderer";

import {
  GRAPH_DATA_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../lib/settings/graph";

export default class WaterfallChart extends LineAreaBarChart {
  static uiName = t`Waterfall`;
  static identifier = "waterfall";
  static iconName = "waterfall";
  static noun = t`waterfall chart`;

  static maxMetricsSupported = 1;
  static maxDimensionsSupported = 1;

  static settings = {
    ...GRAPH_AXIS_SETTINGS,
    "waterfall.increase_color": {
      section: t`Display`,
      props: { title: t`Increase color` },
      widget: "color",
      getDefault: () => color("accent1"),
    },
    "waterfall.decrease_color": {
      section: t`Display`,
      props: { title: t`Decrease color` },
      widget: "color",
      getDefault: () => color("accent3"),
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
      getDefault: () => color("text-dark"),
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
