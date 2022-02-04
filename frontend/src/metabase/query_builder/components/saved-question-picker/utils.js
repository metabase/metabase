import _ from "underscore";
import { getCollectionIcon } from "metabase/entities/collections";

function hasIntersection(list1, list2) {
  return _.intersection(list1, list2).length > 0;
}

export function buildCollectionTree(collections, { targetModels } = {}) {
  if (collections == null) {
    return [];
  }

  const shouldFilterCollections = Array.isArray(targetModels);

  return collections.flatMap(collection => {
    const hasTargetModels =
      !shouldFilterCollections ||
      hasIntersection(targetModels, collection.below) ||
      hasIntersection(targetModels, collection.here);

    return hasTargetModels
      ? {
          id: collection.id,
          name: collection.name,
          schemaName: collection.originalName || collection.name,
          icon: getCollectionIcon(collection),
          children: buildCollectionTree(collection.children, { targetModels }),
        }
      : [];
  });
}

export const findCollectionByName = (collections, name) => {
  if (!collections || collections.length === 0) {
    return null;
  }

  const collection = collections.find(c => c.schemaName === name);

  if (collection) {
    return collection;
  }

  return findCollectionByName(
    collections
      .map(c => c.children)
      .filter(Boolean)
      .flat(),
    name,
  );
};
