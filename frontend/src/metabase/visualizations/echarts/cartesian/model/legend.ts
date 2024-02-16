import type { BaseCartesianChartModel } from "./types";

export const getLegendItems = (chartModel: BaseCartesianChartModel) => {
  return chartModel.seriesModels.map(seriesModel => ({
    name: seriesModel.name,
    color: seriesModel.color,
  }));
};
