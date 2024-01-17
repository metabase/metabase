import type { CardDisplayType } from "metabase-types/api";

import type { SeriesModel } from "../model/types";
import type { DATASET_DIMENSIONS } from "../waterfall/constants";

const WATERFALL_ID_SEPARATOR = "-waterfall-";

export function createWaterfallSeriesIdForECharts(
  seriesModel: SeriesModel,
  echartsDatasetDimension: keyof typeof DATASET_DIMENSIONS,
) {
  return `${seriesModel.dataKey}${WATERFALL_ID_SEPARATOR}${echartsDatasetDimension}`;
}

export function getSeriesIdFromECharts(
  echartsSeriesId: string | number | undefined | null,
  display: CardDisplayType,
) {
  if (
    echartsSeriesId == null ||
    typeof echartsSeriesId === "number" ||
    display !== "waterfall"
  ) {
    return echartsSeriesId;
  }
  return echartsSeriesId.split(WATERFALL_ID_SEPARATOR)[0];
}
