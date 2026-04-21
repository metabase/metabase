import Color from "color";
import { t } from "ttag";

import { color, staticVizOverrides } from "metabase/ui/colors";
import { GRAPH_GOAL_SETTINGS } from "metabase/visualizations/lib/settings/goal";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_DATA_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  TOOLTIP_SETTINGS,
} from "metabase/visualizations/lib/settings/graph";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";

import { CartesianChart } from "../CartesianChart";
import { getCartesianChartDefinition } from "../CartesianChart/chart-definition";

const WaterfallViz: Omit<VisualizationDefinition, "checkRenderable"> = {
  getUiName: () => t`Waterfall`,
  identifier: "waterfall",
  iconName: "waterfall",
  isSensible: ({ cols, rows }) => {
    const dimensionCount = cols.filter(
      (col) => isDimension(col) && !isMetric(col),
    ).length;
    const metricCount = cols.filter(isMetric).length;
    return (
      rows.length > 1 &&
      cols.length >= 2 &&
      dimensionCount === 1 &&
      metricCount > 0
    );
  },
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`waterfall chart`,
  minSize: getMinSize("waterfall"),
  defaultSize: getDefaultSize("waterfall"),
  maxMetricsSupported: 1,
  maxDimensionsSupported: 1,
  supportsVisualizer: false,
  settings: {
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    "waterfall.increase_color": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      getProps: () => ({ title: t`Increase color` }),
      widget: "color",
      getDefault: () => color("accent1"),
    },
    "waterfall.decrease_color": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      getProps: () => ({ title: t`Decrease color` }),
      widget: "color",
      getDefault: () => color("accent3"),
    },
    "waterfall.show_total": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Show total`,
      widget: "toggle",
      getDefault: () => true,
      inline: true,
    },
    "waterfall.total_color": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      getProps: () => ({ title: t`Total color` }),
      widget: "color",
      // Unfortunately, to get static viz to look right, we need to avoid using alpha colors here
      getDefault: () => Color(color("text-primary", staticVizOverrides)).hex(),
      getHidden: (_series: any, vizSettings: ComputedVisualizationSettings) =>
        vizSettings["waterfall.show_total"] !== true,
      readDependencies: ["waterfall.show_total"],
    },
    ...GRAPH_DISPLAY_VALUES_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
    ...TOOLTIP_SETTINGS,
  },
};

Object.assign(WaterfallChart, getCartesianChartDefinition(WaterfallViz));

export function WaterfallChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
