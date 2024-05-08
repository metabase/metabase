import { isBreakoutSeries } from "./guards";
import type { SeriesModel } from "./types";

export const getLegendItems = (
  seriesModels: SeriesModel[],
  showAllLegendItems: boolean = false,
) => {
  if (
    seriesModels.length === 1 &&
    !isBreakoutSeries(seriesModels[0]) &&
    !showAllLegendItems
  ) {
    return [];
  }

  return seriesModels.map(seriesModel => ({
    key: seriesModel.dataKey,
    name: seriesModel.name,
    color: seriesModel.color,
  }));
};
