import type { Collection, CollectionType } from "metabase-types/api";

export function getWritableCollection(
  rootCollection: Collection,
  type: CollectionType,
) {
  const collection = rootCollection.children?.find(
    (collection) => collection.type === type,
  );
  return collection?.can_write ? collection : undefined;
}
