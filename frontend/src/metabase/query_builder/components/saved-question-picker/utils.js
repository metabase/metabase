import _ from "underscore";
import { getCollectionIcon } from "metabase/entities/collections";

export function buildCollectionTree(collections, { targetModels } = {}) {
  if (collections == null) {
    return [];
  }

  const shouldFilterCollections = Array.isArray(targetModels);

  function hasTargetModels(list) {
    return !_.isEmpty(_.intersection(targetModels, list));
  }

  return collections.flatMap(collection => {
    if (!shouldFilterCollections || hasTargetModels(collection.here)) {
      return {
        id: collection.id,
        name: collection.name,
        schemaName: collection.originalName || collection.name,
        icon: getCollectionIcon(collection),
        children: buildCollectionTree(collection.children, { targetModels }),
      };
    }

    return hasTargetModels(collection.below)
      ? buildCollectionTree(collection.children, { targetModels })
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
