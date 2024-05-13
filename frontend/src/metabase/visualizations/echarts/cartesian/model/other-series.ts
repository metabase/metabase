import { t } from "ttag";

import { color } from "metabase/lib/colors";
import { isNumber } from "metabase/lib/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import { OTHER_DATA_KEY } from "../constants/dataset";

import type { ChartDataset, OtherSeriesModel, SeriesModel } from "./types";

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
) {
  const isBarOnly = seriesModels.every(
    seriesModel =>
      settings.series(seriesModel.legacySeriesSettingsObjectKey).display ===
      "bar",
  );

  if (
    settings["graph.max_categories"] == null ||
    seriesModels.length <= settings["graph.max_categories"] ||
    !isBarOnly // TODO add `isAreaOnly` check later
  ) {
    return {
      ungroupedSeriesModels: seriesModels,
      groupedSeriesKeys: [],
      otherSeriesModel: undefined,
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

  const otherSeriesModel: OtherSeriesModel = {
    name: t`Other`,
    color: color("text-light"), // TODO setting,
    dataKey: OTHER_DATA_KEY,
  };

  return {
    ungroupedSeriesModels,
    groupedSeriesKeys: groupedSeriesModels.map(
      seriesModel => seriesModel.dataKey,
    ),
    otherSeriesModel,
  };
}
