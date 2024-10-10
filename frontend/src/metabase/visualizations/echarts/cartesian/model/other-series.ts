import { t } from "ttag";

import { checkNumber } from "metabase/lib/types";
import { SERIES_SETTING_KEY } from "metabase/visualizations/shared/settings/series";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { AggregationType, DatasetColumn } from "metabase-types/api";

import { OTHER_DATA_KEY } from "../constants/dataset";

import type { Datum, RegularSeriesModel, SeriesModel } from "./types";

export function groupSeriesIntoOther(
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
): {
  ungroupedSeriesModels: SeriesModel[];
  groupedSeriesModels: SeriesModel[];
} {
  const maxCategories = settings["graph.max_categories"];

  if (
    !maxCategories ||
    maxCategories <= 0 ||
    seriesModels.length <= maxCategories
  ) {
    return {
      ungroupedSeriesModels: seriesModels,
      groupedSeriesModels: [],
    };
  }

  const ungroupedSeriesModels = seriesModels.slice(
    0,
    settings["graph.max_categories"],
  );
  const groupedSeriesModels = seriesModels.slice(
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
): RegularSeriesModel => {
  const customName = settings[SERIES_SETTING_KEY]?.[OTHER_DATA_KEY]?.title;
  const name = customName ?? t`Other`;

  return {
    name,
    dataKey: OTHER_DATA_KEY,
    color: settings["graph.other_category_color"],
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

export const getAggregatedOtherSeriesValue = (
  seriesModels: SeriesModel[],
  aggregationType: AggregationType = "sum",
  datum: Datum,
): number => {
  const aggregation = AGGREGATION_FN_MAP[aggregationType];
  const values = seriesModels.map(model =>
    checkNumber(datum[model.dataKey] ?? 0),
  );
  return aggregation.fn(values);
};

export const getOtherSeriesAggregationLabel = (
  aggregationType: AggregationType = "sum",
) => AGGREGATION_FN_MAP[aggregationType].label;

const sum = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

const AGGREGATION_FN_MAP: Record<
  AggregationType,
  { fn: (values: number[]) => number; label: string }
> = {
  count: {
    label: t`Total`,
    fn: sum,
  },
  sum: {
    label: t`Total`,
    fn: sum,
  },
  "cum-sum": {
    label: t`Total`,
    fn: sum,
  },
  "cum-count": {
    label: t`Total`,
    fn: sum,
  },
  avg: {
    label: t`Average`,
    fn: values => sum(values) / values.length,
  },
  distinct: {
    label: t`Distinct values`,
    fn: values => new Set(values).size,
  },
  min: {
    label: t`Min`,
    fn: values => Math.min(...values),
  },
  max: {
    label: t`Max`,
    fn: values => Math.max(...values),
  },
  median: {
    label: t`Median`,
    fn: values => {
      const sortedValues = values.sort((a, b) => a - b);
      const middleIndex = Math.floor(sortedValues.length / 2);
      return sortedValues.length % 2
        ? sortedValues[middleIndex]
        : (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
    },
  },
  stddev: {
    label: t`Standard deviation`,
    fn: values => {
      const mean = sum(values) / values.length;
      const squaredDifferences = values.map(v => (v - mean) ** 2);
      const variance = sum(squaredDifferences) / values.length;
      return Math.sqrt(variance);
    },
  },
};
