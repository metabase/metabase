import { t } from "ttag";

import {
  type NormalizableVisualizationProps,
  useNormalizedVisualizationProps,
} from "metabase/visualizations/hooks/use-normalized-visualization-props";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { CartesianChart } from "metabase/visualizations/visualizations/CartesianChart";
import { getCartesianChartDefinition } from "metabase/visualizations/visualizations/CartesianChart/chart-definition";

import { GRAPH_GOAL_SETTINGS } from "../../lib/settings/goal";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_BUBBLE_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_DATA_SETTINGS,
  GRAPH_TREND_SETTINGS,
  TOOLTIP_SETTINGS,
} from "../../lib/settings/graph";
import type { VisualizationDefinition } from "../../types";
import { toVisualizationSettingsDefinitions } from "../../types";

const SCATTER_PLOT_DEFINITION = getCartesianChartDefinition({
  getUiName: () => t`Scatter`,
  identifier: "scatter",
  iconName: "bubble",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`scatter plot`,
  minSize: getMinSize("scatter"),
  defaultSize: getDefaultSize("scatter"),
  settings: toVisualizationSettingsDefinitions({
    ...GRAPH_BUBBLE_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_TREND_SETTINGS,
    ...GRAPH_COLORS_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...GRAPH_DATA_SETTINGS,
    ...TOOLTIP_SETTINGS,
  }),
}) as VisualizationDefinition;

function ScatterPlotComponent(props: NormalizableVisualizationProps) {
  const normalizedProps = useNormalizedVisualizationProps(props);

  return <CartesianChart {...normalizedProps} />;
}

export const ScatterPlot = Object.assign(
  ScatterPlotComponent,
  SCATTER_PLOT_DEFINITION,
);
