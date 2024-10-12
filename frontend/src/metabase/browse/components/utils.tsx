import { t } from "ttag";
import type { CollectionEssentials, CubeDataItem, SearchResult } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { ModelResult } from "../types";
import { getCollectionName } from "../utils";
import { pathSeparatorChar } from "./constants";
import { CubeResult } from "./CubeTable";

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


const getValueForSortingSemantic = (
  cube: CubeDataItem,
  sort_column: keyof CubeDataItem,
): string => {
  if (sort_column === "name") {
    return cube.name;
  } else if (sort_column === "title") {
    return cube.title;
  } else {
    return "";
  }
};

export const isValidSortColumnSemantic = (
  sort_column: string,
): sort_column is keyof CubeDataItem => {
  return ["name", "title"].includes(sort_column);
};

export const getSecondarySortColumnSemantic = (
  sort_column: string,
): keyof CubeDataItem => {
  return sort_column === "name" ? "title" : "name";
};

export const sortCubeData = (
  cubeDataArray: CubeDataItem[],
  sortingOptions: SortingOptions,
  localeCode: string = "en",
) => {
  const { sort_column, sort_direction } = sortingOptions;

  if (!isValidSortColumnSemantic(sort_column)) {
    console.error("Invalid sort column", sort_column);
    return cubeDataArray;
  }

  const compare = (a: string, b: string) =>
    a.localeCompare(b, localeCode, { sensitivity: "base" });

  return [...cubeDataArray].sort((cubeA, cubeB) => {
    const a = getValueForSortingSemantic(cubeA, sort_column);
    const b = getValueForSortingSemantic(cubeB, sort_column);

    let result = compare(a, b);
    if (result === 0) {
      const sort_column2 = getSecondarySortColumnSemantic(sort_column);
      const a2 = getValueForSortingSemantic(cubeA, sort_column2);
      const b2 = getValueForSortingSemantic(cubeB, sort_column2);
      result = compare(a2, b2);
    }

    return sort_direction === SortDirection.Asc ? result : -result;
  });
};

// Sorting for Cube

const getValueForSortingCube = (
  cube: CubeResult,
  sort_column: keyof CubeResult,
): string => {
  if (sort_column === "title") {
    return cube.title;
  } else {
    // You might want to add more sorting options based on the content
    // For now, we'll just return an empty string for 'content'
    return "";
  }
};

export const isValidSortColumnCube = (
  sort_column: string,
): sort_column is keyof CubeResult => {
  return ["title", "type"].includes(sort_column);
};

export const getSecondarySortColumnCube = (
  sort_column: string,
): keyof CubeResult => {
  return sort_column === "title" ? "type" : "title";
};

export const sortDefinitionData = (
  cubeDataArray: CubeResult[],
  sortingOptions: SortingOptions,
  localeCode: string = "en",
) => {
  const { sort_column, sort_direction } = sortingOptions;

  if (!isValidSortColumnCube(sort_column)) {
    console.error("Invalid sort column", sort_column);
    return cubeDataArray;
  }

  const compare = (a: string, b: string) =>
    a.localeCompare(b, localeCode, { sensitivity: "base" });

  return [...cubeDataArray].sort((cubeA, cubeB) => {
    const a = getValueForSortingCube(cubeA, sort_column);
    const b = getValueForSortingCube(cubeB, sort_column);

    let result = compare(a, b);
    if (result === 0) {
      const sort_column2 = getSecondarySortColumnCube(sort_column);
      const a2 = getValueForSortingCube(cubeA, sort_column2);
      const b2 = getValueForSortingCube(cubeB, sort_column2);
      result = compare(a2, b2);
    }

    return sort_direction === SortDirection.Asc ? result : -result;
  });
};