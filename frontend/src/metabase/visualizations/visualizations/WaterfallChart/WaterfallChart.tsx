import { t } from "ttag";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { getCartesianChartDefinition } from "metabase/visualizations/visualizations/CartesianChart/chart-definition";
import {
  GRAPH_DATA_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../../lib/settings/graph";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "../../types";
import { color } from "metabase/lib/colors";

Object.assign(
  WaterfallChart,
  getCartesianChartDefinition({
    uiName: t`Waterfall`,
    identifier: "waterfall",
    iconName: "waterfall",
    noun: t`waterfall chart`,
    minSize: getMinSize("waterfall"),
    defaultSize: getDefaultSize("waterfall"),
    settings: {
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
        inline: true,
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
    } as any as VisualizationSettingsDefinitions,
    onDisplayUpdate: (settings: ComputedVisualizationSettings) => {
      if (settings["stackable.stack_display"]) {
        settings["stackable.stack_display"] = "area";
      }
      return settings;
    },
  }),
);

export function WaterfallChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
