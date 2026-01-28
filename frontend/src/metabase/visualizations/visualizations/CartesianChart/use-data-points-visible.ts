import type { BaseCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

export const useAreAllDataPointsOutOfRange = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
) => {
  if (settings["graph.y_axis.auto_range"]) {
    return false;
  }

  const { "graph.y_axis.min": yMin, "graph.y_axis.max": yMax } = settings;

  if (yMax === undefined || yMin === undefined) {
    return false;
  }

  const dataKeys = chartModel.seriesModels.map(
    (seriesModel) => seriesModel.dataKey,
  );

  return chartModel.dataset.every((data) =>
    dataKeys.every((key) => {
      const value = data[key] as number;
      return value === null || value < yMin || yMax < value;
    }),
  );
};
