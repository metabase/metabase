import type { Collection, CollectionType } from "metabase-types/api";

export function getAccessibleCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  return rootCollection.children?.find(
    (collection) => collection.type === type,
  );
}

export function getWritableCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  const collection = getAccessibleCollection(rootCollection, type);
  return collection?.can_write ? collection : undefined;
}
