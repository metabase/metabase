import { t } from "ttag";

import { transformSeries } from "metabase/visualizations/visualizations/CartesianChart/definition-legacy";
import {
  BOXPLOT_DATA_SETTINGS,
  BOXPLOT_SETTINGS,
  type ComputedVisualizationSettings,
  GRAPH_AXIS_SETTINGS,
  GRAPH_GOAL_SETTINGS,
  type VisualizationDefinition,
  getDefaultSize,
  getMinSize,
  validateChartDataSettings,
} from "metabase/viz-core";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries } from "metabase-types/api";

export const BOXPLOT_CHART_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Box Plot`,
  identifier: "boxplot",
  iconName: "boxplot",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  noun: t`box plot`,
  minSize: getMinSize("boxplot"),
  defaultSize: getDefaultSize("boxplot"),
  maxMetricsSupported: Infinity,
  maxDimensionsSupported: 2,
  noHeader: true,
  transformSeries,

  isSensible: ({ cols, rows }: DatasetData) => {
    return (
      rows.length > 1 &&
      cols.length >= 3 &&
      cols.filter(isDimension).length >= 2 &&
      cols.filter(isMetric).length > 0
    );
  },

  checkRenderable: (
    _series: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    validateChartDataSettings(settings);
  },

  settings: {
    ...BOXPLOT_SETTINGS,
    ...GRAPH_GOAL_SETTINGS,
    ...GRAPH_AXIS_SETTINGS,
    ...BOXPLOT_DATA_SETTINGS,
  },
};
