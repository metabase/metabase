import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import { getCartesianChartDefinition } from "metabase/visualizations/visualizations/CartesianChart/chart-definition";

import { GRAPH_GOAL_SETTINGS } from "../../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  STACKABLE_SETTINGS,
  TOOLTIP_SETTINGS,
  LEGEND_SETTINGS,
} from "../../lib/settings/graph";
import type {
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "../../types";

Object.assign(
  BarChart,
  getCartesianChartDefinition({
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
      ...TOOLTIP_SETTINGS,
      ...LEGEND_SETTINGS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function BarChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
