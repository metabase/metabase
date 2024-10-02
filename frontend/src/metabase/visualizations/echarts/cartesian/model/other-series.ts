import { isNumber } from "metabase/lib/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import type { ChartDataset, SeriesModel } from "./types";

function getRowValueForSorting(value: RowValue) {
  if (isNumber(value)) {
    return value;
  }
  // For ranking series to group into the "other" series, we consider null
  // values to be the smallest
  return -Infinity;
}

export function groupSeriesIntoOther(
  dataset: ChartDataset,
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
): {
  ungroupedSeriesModels: SeriesModel[];
  groupedSeriesModels: SeriesModel[];
} {
  const isBarOnly = seriesModels.every(
    seriesModel =>
      settings.series(seriesModel.legacySeriesSettingsObjectKey).display ===
      "bar",
  );

  if (
    !isBarOnly ||
    settings["graph.max_categories"] == null ||
    seriesModels.length <= settings["graph.max_categories"]
  ) {
    return {
      ungroupedSeriesModels: seriesModels,
      groupedSeriesModels: [],
    };
  }

  const lastDatum = dataset[dataset.length - 1];

  const sortedSeriesModels = [...seriesModels].sort(
    (seriesModelA, seriesModelB) =>
      getRowValueForSorting(lastDatum[seriesModelB.dataKey]) -
      getRowValueForSorting(lastDatum[seriesModelA.dataKey]),
  );

  const ungroupedSeriesModels = sortedSeriesModels.slice(
    0,
    settings["graph.max_categories"],
  );
  const groupedSeriesModels = sortedSeriesModels.slice(
    settings["graph.max_categories"],
  );

  return {
    ungroupedSeriesModels,
    groupedSeriesModels,
  };
}
