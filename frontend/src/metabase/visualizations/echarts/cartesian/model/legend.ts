import type { CartesianChartModel } from "./types";

export const getLegendItems = (chartModel: CartesianChartModel) => {
  return chartModel.seriesModels.map(seriesModel => ({
    name: seriesModel.name,
    color: seriesModel.color,
  }));
};
