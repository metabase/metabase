import type { CollectionId } from "metabase-types/api";

type SearchableCollection = {
  id: CollectionId;
  children?: SearchableCollection[] | null;
};

export const findCollectionById = <T extends SearchableCollection>(
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
    // A node's children are the same concrete type as the node, but the recursive constraint only records them as
    // `SearchableCollection`, so the narrowing has to be asserted.
    collections.flatMap((c) => (c.children ?? []) as T[]),
    collectionId,
  );
};
