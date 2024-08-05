import { t } from "ttag";

import { isRootCollection } from "metabase/collections/utils";
import type { CollectionEssentials } from "metabase-types/api";

import { pathSeparatorChar } from "./constants";

export const getCollectionName = (collection: CollectionEssentials) => {
  if (isRootCollection(collection)) {
    return t`Our analytics`;
  }
  return collection?.name || t`Untitled collection`;
};

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

export const getCollectionPathString = (collection: CollectionEssentials) => {
  const ancestors: CollectionEssentials[] =
    collection.effective_ancestors || [];
  const collections = ancestors.concat(collection);
  const pathString = collections
    .map(coll => getCollectionName(coll))
    .join(` ${pathSeparatorChar} `);
  return pathString;
};
