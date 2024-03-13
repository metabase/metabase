import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { BaseCartesianChartModel } from "./types";

export const getLegendItems = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
) => {
  const legendItems = chartModel.seriesModels.map(seriesModel => ({
    name: seriesModel.name,
    color: seriesModel.color,
  }));

  // On stacked charts we reverse the order of series so that the series
  // order in the sidebar matches series order on the chart
  const isReversed = settings["stackable.stack_type"] != null;
  if (isReversed) {
    legendItems.reverse();
  }

  return legendItems;
};
