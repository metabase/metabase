import { isBreakoutSeries } from "./guards";
import type { SeriesModel } from "./types";

export const getLegendItems = (seriesModels: SeriesModel[]) => {
  if (seriesModels.length === 1 && !isBreakoutSeries(seriesModels[0])) {
    return [];
  }

  return seriesModels.map(seriesModel => ({
    name: seriesModel.name,
    color: seriesModel.color,
  }));
};
