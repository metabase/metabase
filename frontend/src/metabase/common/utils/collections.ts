import type { Collection, CollectionId } from "metabase-types/api";

export const findCollectionById = (
  collections?: Collection[],
  collectionId?: CollectionId,
): Collection | null => {
  if (!collections?.length || !collectionId) {
    return null;
  }

  const collection = collections.find((c) => c.id === collectionId);

  if (collection) {
    return collection;
  }

  return findCollectionById(
    collections
      .map((c) => c.children)
      .filter(Boolean)
      .flat() as Collection[],
    collectionId,
  );
};
