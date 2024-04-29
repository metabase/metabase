import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import type { CollectionItem, Collection } from "metabase-types/api";

import { getCollectionName } from "../utils";

export const getBreadcrumbMaxWidths = (
  collections: Collection["effective_ancestors"],
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

export const isModel = (item: CollectionItem) => item.model === "dataset";

export const getModelDescription = (item: CollectionItem) => {
  if (
    item.collection &&
    isRootCollection(item.collection) &&
    isModel(item) &&
    !item.description?.trim()
  ) {
    return t`A model`;
  } else {
    return item.description;
  }
};
