import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

export const useAreAllDataPointsOutOfRange = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
) => {
  if (settings["graph.y_axis.auto_range"]) {
    return false;
  }

  const { "graph.y_axis.min": yMin, "graph.y_axis.max": yMax } = settings;

  if (!yMax || !yMin) {
    return true;
  }

  const dataKeys = chartModel.seriesModels.map(
    (seriesModel) => seriesModel.dataKey,
  );
  return chartModel.dataset.every((data) =>
    dataKeys.every((key) => {
      const value = data[key] as number;
      return yMin > value || value > yMax;
    }),
  );
};
