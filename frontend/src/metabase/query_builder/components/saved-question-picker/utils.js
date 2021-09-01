import { isPersonalCollection } from "metabase/collections/utils";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

const getCollectionIcon = collection => {
  if (collection.id === PERSONAL_COLLECTIONS.id) {
    return "group";
  }

  return isPersonalCollection(collection) ? "person" : "folder";
};

export function buildCollectionTree(collections) {
  if (collections == null) {
    return [];
  }

  return collections.map(collection => ({
    id: collection.id,
    name: collection.name,
    schemaName: collection.originalName || collection.name,
    icon: getCollectionIcon(collection),
    children: buildCollectionTree(collection.children),
  }));
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
