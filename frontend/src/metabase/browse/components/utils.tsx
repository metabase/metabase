import { t } from "ttag";

import type { CollectionEssentials, SearchResult } from "metabase-types/api";

import { getCollectionName } from "../utils";

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
