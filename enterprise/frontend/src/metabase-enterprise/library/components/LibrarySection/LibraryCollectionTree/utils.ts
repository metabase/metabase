import type { Collection, LibraryCollectionType } from "metabase-types/api";

export function getWritableLibraryCollection(
  rootCollection: Collection,
  type: LibraryCollectionType,
) {
  const collection = rootCollection.children?.find(
    (collection) => collection.type === type,
  );
  return collection?.can_write ? collection : undefined;
}
