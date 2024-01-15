import { t } from "ttag";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import LineAreaBarChart from "metabase/visualizations/components/LineAreaBarChart";
import { getCartesianChartDefinition } from "metabase/visualizations/visualizations/CartesianChart/chart-definition";
import { GRAPH_GOAL_SETTINGS } from "../../lib/settings/goal";
import {
  GRAPH_DATA_SETTINGS,
  LINE_SETTINGS,
  GRAPH_TREND_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_AXIS_SETTINGS,
  GRAPH_DISPLAY_VALUES_SETTINGS,
} from "../../lib/settings/graph";
import type {
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "../../types";

Object.assign(
  LineChart,
  getCartesianChartDefinition({
    transformSeries: LineAreaBarChart.transformSeries,
    uiName: t`Line`,
    identifier: "line",
    iconName: "line",
    noun: t`line chart`,
    minSize: getMinSize("line"),
    defaultSize: getDefaultSize("line"),
    settings: {
      ...LINE_SETTINGS,
      ...GRAPH_GOAL_SETTINGS,
      ...GRAPH_TREND_SETTINGS,
      ...GRAPH_COLORS_SETTINGS,
      ...GRAPH_AXIS_SETTINGS,
      ...GRAPH_DISPLAY_VALUES_SETTINGS,
      ...GRAPH_DATA_SETTINGS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function LineChart(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
