import { t } from "ttag";

import { color } from "metabase/lib/colors";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  GRAPH_DATA_SETTINGS,
} from "metabase/visualizations/lib/settings/graph";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";

import { CartesianChart } from "../CartesianChart";
import { getCartesianChartDefinition } from "../CartesianChart/chart-definition";

Object.assign(
  WaterfallChart,
  getCartesianChartDefinition({
    uiName: t`Waterfall`,
    identifier: "waterfall",
    iconName: "waterfall",
    noun: t`waterfall chart`,
    minSize: getMinSize("waterfall"),
    defaultSize: getDefaultSize("waterfall"),
    maxMetricsSupported: 1,
    maxDimensionsSupported: 1,
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
        getHidden: (_series: any, vizSettings: ComputedVisualizationSettings) =>
          vizSettings["waterfall.show_total"] !== true,
        readDependencies: ["waterfall.show_total"],
      },
      ...GRAPH_DISPLAY_VALUES_SETTINGS,
      ...GRAPH_DATA_SETTINGS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function WaterfallChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
