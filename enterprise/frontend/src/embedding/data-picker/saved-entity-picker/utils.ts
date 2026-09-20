import type { CollectionId } from "metabase-types/api";

export const findCollectionById = <
  T extends { id: CollectionId; children?: T[] },
>(
  collections: T[],
  collectionId: CollectionId,
): T | null => {
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
