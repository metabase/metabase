import { isBreakoutSeries } from "./guards";
import type { LegendItem, OtherSeriesModel, SeriesModel } from "./types";

export const getLegendItems = (
  seriesModels: SeriesModel[],
  otherSeriesModel?: OtherSeriesModel,
  showAllLegendItems?: boolean,
): LegendItem[] => {
  const legendSeriesModels: (SeriesModel | OtherSeriesModel)[] = [
    ...seriesModels,
  ];
  if (otherSeriesModel) {
    legendSeriesModels.push(otherSeriesModel);
  }

  if (
    legendSeriesModels.length === 1 &&
    !isBreakoutSeries(legendSeriesModels[0]) &&
    !showAllLegendItems
  ) {
    return [];
  }

  return legendSeriesModels.map(seriesModel => ({
    key: seriesModel.dataKey,
    name: seriesModel.name,
    color: seriesModel.color,
  }));
};
