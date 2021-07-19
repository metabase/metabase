import { getCollectionIcon } from "metabase/entities/collections";

export function buildCollectionTree(collections) {
  if (collections == null) {
    return [];
  }
  return collections.map(collection => {
    const icon = getCollectionIcon(collection);
    return {
      id: collection.id,
      name: collection.name,
      schemaName: collection.originalName || collection.name,
      icon: icon.name,
      iconColor: icon.color,
      children: buildCollectionTree(collection.children),
    };
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
