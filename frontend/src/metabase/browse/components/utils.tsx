import { t } from "ttag";

import type { SortingOptions } from "metabase/components/ItemsTable/BaseItemsTable";
import { SortDirection } from "metabase/components/ItemsTable/Columns";
import type {
  CollectionEssentials,
  ModelResult,
  SearchResult,
} from "metabase-types/api";

import { getCollectionName } from "../utils";

import { pathSeparatorChar } from "./constants";

export const getBreadcrumbMaxWidths = (
  collections: CollectionEssentials["effective_ancestors"],
  totalUnitsOfWidthAvailable: number,
  isPathEllipsified: boolean,
) => {
  if (!collections || collections.length < 2) {
    return [];
  }
  const lengths = collections.map(
    collection => getCollectionName(collection).length,
  );
  const ratio = lengths[0] / (lengths[0] + lengths[1]);
  const firstWidth = Math.max(
    Math.round(ratio * totalUnitsOfWidthAvailable),
    25,
  );
  const secondWidth = totalUnitsOfWidthAvailable - firstWidth;
  const padding = isPathEllipsified ? "2rem" : "1rem";
  return [
    `calc(${firstWidth}cqw - ${padding})`,
    `calc(${secondWidth}cqw - ${padding})`,
  ];
};

export const isModel = (item: SearchResult) => item.model === "dataset";

export const getModelDescription = (item: SearchResult) => {
  if (item.collection && isModel(item) && !item.description?.trim()) {
    return t`A model`;
  } else {
    return item.description;
  }
};

export const getCollectionPathString = (collection: CollectionEssentials) => {
  const ancestors: CollectionEssentials[] =
    collection.effective_ancestors || [];
  const collections = ancestors.concat(collection);
  const pathString = collections
    .map(coll => getCollectionName(coll))
    .join(` ${pathSeparatorChar} `);
  return pathString;
};

const getValueForSorting = (
  model: ModelResult,
  sort_column: keyof ModelResult,
): string => {
  if (sort_column === "collection") {
    return getCollectionPathString(model.collection);
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
  // FIXME: This is probably over-optimized
  const { sort_column: primarySortColumn, sort_direction } = sortingOptions;

  if (!isValidSortColumn(primarySortColumn)) {
    console.error("Invalid sort column", primarySortColumn);
    return models;
  }

  const compare = (a: string, b: string) =>
    a.localeCompare(b, localeCode, { sensitivity: "base" });

  const secondarySortColumn = getSecondarySortColumn(primarySortColumn);

  const primaryValues = Array.from(
    new Set(models.map(model => getValueForSorting(model, primarySortColumn))),
  );
  const secondaryValues = Array.from(
    new Set(
      models.map(model => getValueForSorting(model, secondarySortColumn)),
    ),
  );

  primaryValues.sort(compare);
  secondaryValues.sort(compare);

  const primaryOrderMap = new Map(
    primaryValues.map((value, index) => [value, index]),
  );
  const secondaryOrderMap = new Map(
    secondaryValues.map((value, index) => [value, index]),
  );

  // Use pre-computed value orders for fast comparison
  const comparePrimary = (a: string, b: string) =>
    primaryOrderMap.get(a)! - primaryOrderMap.get(b)!;
  const compareSecondary = (a: string, b: string) =>
    secondaryOrderMap.get(a)! - secondaryOrderMap.get(b)!;

  return [...models].sort((modelA, modelB) => {
    const a = getValueForSorting(modelA, primarySortColumn);
    const b = getValueForSorting(modelB, primarySortColumn);

    let result = comparePrimary(a, b);
    if (result === 0) {
      const a2 = getValueForSorting(modelA, secondarySortColumn);
      const b2 = getValueForSorting(modelB, secondarySortColumn);
      result = compareSecondary(a2, b2);
    }

    return sort_direction === SortDirection.Asc ? result : -result;
  });
};
