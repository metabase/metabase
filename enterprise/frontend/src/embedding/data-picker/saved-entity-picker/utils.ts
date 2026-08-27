import type { Collection, CollectionId } from "metabase-types/api";

export const findCollectionById = (
  collections: Collection[],
  collectionId: CollectionId,
): Collection | null => {
  if (!collections || collections.length === 0) {
    return null;
  }

  const collection = collections.find((c) => c.id === collectionId);

  if (collection) {
    return collection;
  }

  return findCollectionById(
    collections.flatMap((c) => c.children ?? []),
    collectionId,
  );
};
