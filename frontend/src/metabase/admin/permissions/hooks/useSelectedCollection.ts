import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import type { Collection, CollectionId } from "metabase-types/api";

function findCollection(
  collections: Collection[],
  id: CollectionId,
): Collection | null {
  for (const collection of collections) {
    if (collection.id === id) {
      return collection;
    }
    if (collection.children) {
      const found = findCollection(collection.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function useSelectedCollection(
  collectionsQuery: Record<string, unknown>,
  collectionId: CollectionId | undefined,
  rootCollectionName?: string,
): Collection | null {
  const { data: collections } = useListCollectionsTreeQuery(collectionsQuery);

  return useMemo(() => {
    if (collectionId === undefined) {
      return null;
    }

    if (collectionId === "root") {
      // ROOT_COLLECTION is a special placeholder that doesn't have all Collection properties,
      // but we need to treat it as a Collection for permissions purposes
      return {
        ...ROOT_COLLECTION,
        name: rootCollectionName ?? ROOT_COLLECTION.name,
        children: collections ?? [],
      } as unknown as Collection;
    }

    return findCollection(collections ?? [], collectionId);
  }, [collections, collectionId, rootCollectionName]);
}
