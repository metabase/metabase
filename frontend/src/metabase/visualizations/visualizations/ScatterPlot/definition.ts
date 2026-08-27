import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { getCartesianChartDefinition } from "metabase/visualizations/visualizations/CartesianChart/definition";

import { GRAPH_GOAL_SETTINGS } from "../../lib/settings/goal";
import {
  GRAPH_AXIS_SETTINGS,
  GRAPH_BUBBLE_SETTINGS,
  GRAPH_COLORS_SETTINGS,
  GRAPH_DATA_SETTINGS,
  GRAPH_TREND_SETTINGS,
  SPLIT_PANELS_SETTINGS,
  TOOLTIP_SETTINGS,
} from "../../lib/settings/graph";
import { TIMELINE_EVENTS_SETTINGS } from "../../lib/settings/timelineEvents";
import type { VisualizationDefinition } from "../../types";

const ScatterViz: Omit<
  VisualizationDefinition,
  "isSensible" | "checkRenderable"
> = {
  getUiName: () => t`Scatter`,
  identifier: "scatter",
  iconName: "bubble",
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
    ...SPLIT_PANELS_SETTINGS,
    ...TOOLTIP_SETTINGS,
    ...TIMELINE_EVENTS_SETTINGS,
  },
};

export const SCATTER_PLOT_DEFINITION = getCartesianChartDefinition(ScatterViz);
