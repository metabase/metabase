import { t } from "ttag";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { getCartesianChartDefinition } from "metabase/visualizations/visualizations/CartesianChart/chart-definition";
import { GRAPH_GOAL_SETTINGS } from "../../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  LINE_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
  STACKABLE_SETTINGS,
} from "../../lib/settings/graph";
import type {
  ComputedVisualizationSettings,
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "../../types";

Object.assign(
  AreaChart,
  getCartesianChartDefinition({
    uiName: t`Area`,
    identifier: "area",
    iconName: "area",
    noun: t`area chart`,
    minSize: getMinSize("area"),
    defaultSize: getDefaultSize("area"),
    settings: {
      ...LINE_SETTINGS,
      ...STACKABLE_SETTINGS,
      ...GRAPH_GOAL_SETTINGS,
      ...GRAPH_TREND_SETTINGS,
      ...GRAPH_COLORS_SETTINGS,
      ...GRAPH_AXIS_SETTINGS,
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

export function AreaChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
