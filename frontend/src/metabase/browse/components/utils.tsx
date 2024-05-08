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

  return [...models].sort((a, b) => {
    const aValue = getValueForSorting(a, sort_column);
    const bValue = getValueForSorting(b, sort_column);
    const [firstValue, secondValue] =
      sort_direction === SortDirection.Asc
        ? [aValue, bValue]
        : [bValue, aValue];
    return firstValue.localeCompare(secondValue, localeCode, {
      sensitivity: "base",
    });
  });
};
