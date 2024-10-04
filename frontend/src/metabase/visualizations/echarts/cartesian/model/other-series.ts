import { t } from "ttag";

import { isNumber } from "metabase/lib/types";
import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { DatasetColumn, RowValue } from "metabase-types/api";

import { OTHER_DATA_KEY } from "../constants/dataset";

import type { ChartDataset, RegularSeriesModel, SeriesModel } from "./types";

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
  const maxCategories = settings["graph.max_categories"];
  const isBarOnly = seriesModels.every(
    seriesModel =>
      settings.series(seriesModel.legacySeriesSettingsObjectKey).display ===
      "bar",
  );

  if (
    !isBarOnly ||
    !maxCategories ||
    maxCategories <= 0 ||
    seriesModels.length <= maxCategories
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

export const createOtherGroupSeriesModel = (
  column: DatasetColumn,
  columnIndex: number,
  settings: ComputedVisualizationSettings,
  isVisible: boolean,
  renderingContext: RenderingContext,
): RegularSeriesModel => {
  const customName = settings[SERIES_SETTING_KEY]?.[OTHER_DATA_KEY]?.title;
  const name = customName ?? t`Other`;

  return {
    name,
    dataKey: OTHER_DATA_KEY,
    color: renderingContext.getColor("text-light"),
    visible: isVisible,
    column,
    columnIndex,
    vizSettingsKey: OTHER_DATA_KEY,
    legacySeriesSettingsObjectKey: {
      card: {
        _seriesKey: OTHER_DATA_KEY,
      },
    },
    tooltipName: name,
  };
};
