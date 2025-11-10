import type { Collection, CollectionId } from "metabase-types/api";

export const findCollectionById = (
  collectionsTree?: Collection[],
  collectionId?: CollectionId,
): Collection | null => {
  if (!collectionsTree?.length || !collectionId) {
    return null;
  }

  const collection = collectionsTree.find((c) => c.id === collectionId);

  if (collection) {
    return collection;
  }

  return findCollectionById(
    collectionsTree.map((c) => c.children || []).flat(),
    collectionId,
  );
};
