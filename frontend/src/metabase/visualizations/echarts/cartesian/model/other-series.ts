import { t } from "ttag";

import { checkNumber } from "metabase/lib/types";
import { isEmpty } from "metabase/lib/validate";
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
    !settings["graph.max_categories_enabled"] ||
    !maxCategories ||
    maxCategories <= 0 ||
    seriesModels.length <= maxCategories
  ) {
    return {
      ungroupedSeriesModels: seriesModels,
      groupedSeriesModels: [],
    };
  }

  const isReversed = !isEmpty(settings["stackable.stack_type"]);
  const _seriesModels = isReversed ? seriesModels.toReversed() : seriesModels;

  const ungroupedSeriesModels = _seriesModels.slice(
    0,
    settings["graph.max_categories"],
  );
  if (isReversed) {
    ungroupedSeriesModels.reverse();
  }

  const groupedSeriesModels = _seriesModels.slice(
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
  get count() {
    return {
      label: t`Total`,
      fn: sum,
    };
  },
  get sum() {
    return {
      label: t`Total`,
      fn: sum,
    };
  },
  get "cum-sum"() {
    return {
      label: t`Total`,
      fn: sum,
    };
  },
  get "cum-count"() {
    return {
      label: t`Total`,
      fn: sum,
    };
  },
  get avg() {
    return {
      label: t`Average`,
      fn: (values: number[]) => sum(values) / values.length,
    };
  },
  get distinct() {
    return {
      label: t`Distinct values`,
      fn: (values: number[]) => new Set(values).size,
    };
  },
  get min() {
    return {
      label: t`Min`,
      fn: (values: number[]) => Math.min(...values),
    };
  },
  get max() {
    return {
      label: t`Max`,
      fn: (values: number[]) => Math.max(...values),
    };
  },
  get median() {
    return {
      label: t`Median`,
      fn: (values: number[]) => {
        const sortedValues = values.sort((a, b) => a - b);
        const middleIndex = Math.floor(sortedValues.length / 2);
        return sortedValues.length % 2
          ? sortedValues[middleIndex]
          : (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
      },
    };
  },
  get stddev() {
    return {
      label: t`Standard deviation`,
      fn: (values: number[]) => {
        const mean = sum(values) / values.length;
        const squaredDifferences = values.map(v => (v - mean) ** 2);
        const variance = sum(squaredDifferences) / values.length;
        return Math.sqrt(variance);
      },
    };
  },
};
