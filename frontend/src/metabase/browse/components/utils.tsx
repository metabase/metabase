import { t } from "ttag";

import { getCollectionPathAsString } from "metabase/collections/utils";
import type { SearchResult } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { ModelResult } from "../types";

export const isModel = (item: SearchResult) => item.model === "dataset";

export const getModelDescription = (item: SearchResult) => {
  if (item.collection && isModel(item) && !item.description?.trim()) {
    return t`A model`;
  } else {
    return item.description;
  }
};

const getValueForSorting = (
  model: ModelResult,
  sort_column: keyof ModelResult,
): string => {
  if (sort_column === "collection") {
    return getCollectionPathAsString(model.collection);
  } else {
    return model[sort_column];
  }
};

export const isValidSortColumn = (
  sort_column: string,
): sort_column is keyof ModelResult => {
  return ["name", "collection"].includes(sort_column);
};

export const getSecondarySortColumn = (
  sort_column: string,
): keyof ModelResult => {
  return sort_column === "name" ? "collection" : "name";
};

export const sortModels = (
  models: ModelResult[],
  sortingOptions: SortingOptions,
  localeCode: string = "en",
) => {
  const { sort_column, sort_direction } = sortingOptions;

  if (!isValidSortColumn(sort_column)) {
    console.error("Invalid sort column", sort_column);
    return models;
  }

  const compare = (a: string, b: string) =>
    a.localeCompare(b, localeCode, { sensitivity: "base" });

  return [...models].sort((modelA, modelB) => {
    const a = getValueForSorting(modelA, sort_column);
    const b = getValueForSorting(modelB, sort_column);

    let result = compare(a, b);
    if (result === 0) {
      const sort_column2 = getSecondarySortColumn(sort_column);
      const a2 = getValueForSorting(modelA, sort_column2);
      const b2 = getValueForSorting(modelB, sort_column2);
      result = compare(a2, b2);
    }

    return sort_direction === SortDirection.Asc ? result : -result;
  });
};

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
