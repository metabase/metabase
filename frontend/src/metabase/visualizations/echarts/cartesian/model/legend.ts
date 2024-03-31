import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import type { BaseCartesianChartModel } from "./types";

export const getLegendItems = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
) => {
  const isReversed = settings["stackable.stack_type"] != null;
  const legendItems = chartModel.seriesModels.map(seriesModel => ({
    name: seriesModel.name,
    color: seriesModel.color,
  }));

  return {
    legendItems,
    isReversed,
  };
};
