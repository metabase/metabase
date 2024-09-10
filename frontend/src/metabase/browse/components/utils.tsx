import { t } from "ttag";

import { getCollectionPathAsString } from "metabase/collections/utils";
import type { Dataset, SearchResult } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { MetricResult, ModelResult } from "../types";

export type ModelOrMetricResult = ModelResult | MetricResult;

export const isModel = (item: SearchResult) => item.model === "dataset";

export const getModelDescription = (item: ModelResult) => {
  if (item.collection && !item.description?.trim()) {
    return t`A model`;
  } else {
    return item.description;
  }
};

export const isMetric = (item: SearchResult) => item.model === "metric";

export const getMetricDescription = (item: MetricResult) => {
  if (item.collection && !item.description?.trim()) {
    return t`A metric`;
  }

  return item.description;
};

const getValueForSorting = (
  model: ModelResult | MetricResult,
  sort_column: keyof ModelResult,
): string => {
  if (sort_column === "collection") {
    return getCollectionPathAsString(model.collection) ?? "";
  } else {
    return model[sort_column] ?? "";
  }
};

export const isValidSortColumn = (
  sort_column: string,
): sort_column is keyof ModelResult => {
  return ["name", "collection", "description"].includes(sort_column);
};

export const getSecondarySortColumn = (
  sort_column: string,
): keyof ModelResult => {
  return sort_column === "name" ? "collection" : "name";
};

export function sortModelOrMetric<T extends ModelOrMetricResult>(
  modelsOrMetrics: T[],
  sortingOptions: SortingOptions,
  localeCode: string = "en",
) {
  const { sort_column, sort_direction } = sortingOptions;

  if (!isValidSortColumn(sort_column)) {
    console.error("Invalid sort column", sort_column);
    return modelsOrMetrics;
  }

  const compare = (a: string, b: string) =>
    a.localeCompare(b, localeCode, { sensitivity: "base" });

  return [...modelsOrMetrics].sort((modelOrMetricA, modelOrMetricB) => {
    const a = getValueForSorting(modelOrMetricA, sort_column);
    const b = getValueForSorting(modelOrMetricB, sort_column);

    let result = compare(a, b);
    if (result === 0) {
      const sort_column2 = getSecondarySortColumn(sort_column);
      const a2 = getValueForSorting(modelOrMetricA, sort_column2);
      const b2 = getValueForSorting(modelOrMetricB, sort_column2);
      result = compare(a2, b2);
    }

    return sort_direction === SortDirection.Asc ? result : -result;
  });
}

/** Find the maximum number of recently viewed models to show.
 * This is roughly proportional to the number of models the user
 * has permission to see */
export const getMaxRecentModelCount = (
  /** How many models the user has permission to see */
  modelCount: number,
) => {
  if (modelCount > 20) {
    return 8;
  }
  if (modelCount > 9) {
    return 4;
  }
  return 0;
};

export function isDatasetScalar(dataset: Dataset) {
  return dataset.data.cols.length === 1 && dataset.data.rows.length === 1;
}

export function getDatasetScalarValueForMetric(dataset: Dataset) {
  const isScalar = isDatasetScalar(dataset);
  if (!isScalar) {
    return null;
  }

  const columnMetadata = dataset.data.results_metadata?.columns?.[0];

  const lastRow = dataset.data.rows?.at(-1);
  const columnValue = lastRow?.[0];

  if (columnValue === undefined) {
    return null;
  }

  return {
    tooltip: t`Overall`,
    value: columnValue,
    column: columnMetadata,
  };
}
