import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
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
import type {
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "../../types";

Object.assign(
  ScatterPlot,
  getCartesianChartDefinition({
    getUiName: () => t`Scatter`,
    identifier: "scatter",
    iconName: "bubble",
    getSensibility: data => {
      const { cols, rows } = data;
      const dimensionCount = cols.filter(isDimension).length;
      const metricCount = cols.filter(isMetric).length;

      if (
        rows.length <= 1 ||
        cols.length < 2 ||
        dimensionCount < 1 ||
        metricCount < 1
      ) {
        return "nonsensible";
      }
      return "recommended";
    },
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    noun: t`scatter plot`,
    minSize: getMinSize("scatter"),
    defaultSize: getDefaultSize("scatter"),
    settings: {
      ...GRAPH_BUBBLE_SETTINGS,
      ...GRAPH_GOAL_SETTINGS,
      ...GRAPH_TREND_SETTINGS,
      ...GRAPH_COLORS_SETTINGS,
      ...GRAPH_AXIS_SETTINGS,
      ...GRAPH_DATA_SETTINGS,
      ...TOOLTIP_SETTINGS,
    } as any as VisualizationSettingsDefinitions,
  }),
);

export function ScatterPlot(props: VisualizationProps) {
  return <CartesianChart {...props} />;
}
