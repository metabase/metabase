import { collectionApi } from "metabase/api";
import { findCollectionById } from "metabase/common/utils/collections";
import type { Collection, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getCollectionFromCollectionsTree = (
  state: State,
  collectionId: CollectionId,
): Collection | null => {
  const queriesCache = state[collectionApi.reducerPath]?.queries || {};

  for (const [queryName, queryState] of Object.entries(queriesCache)) {
    if (
      queryName.startsWith(collectionApi.endpoints.listCollectionsTree.name) &&
      queryState?.status === "fulfilled" &&
      queryState?.data
    ) {
      const collections = queryState.data as Collection[];
      const collection = findCollectionById(collections, collectionId);

      if (collection) {
        return collection;
      }
    }
  }

  return null;
};
