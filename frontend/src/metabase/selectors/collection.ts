import { collectionApi } from "metabase/api";
import { findCollectionById } from "metabase/common/utils/collections";
import type { Collection, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getCollectionFromCollectionsTree = (
  state: State,
  collectionId: CollectionId,
): Collection | undefined => {
  const queriesCache = state[collectionApi.reducerPath]?.queries || {};
  let collection: Collection | undefined;
  let latestQueryTimestamp = 0;

  for (const [queryName, queryState] of Object.entries(queriesCache)) {
    if (
      queryName.startsWith(collectionApi.endpoints.listCollectionsTree.name) &&
      queryState?.status === "fulfilled" &&
      queryState?.data
    ) {
      if (queryState.fulfilledTimeStamp < latestQueryTimestamp) {
        continue;
      }

      const collectionsTree = queryState.data as Collection[];
      const foundCollection = findCollectionById(collectionsTree, collectionId);

      if (foundCollection) {
        latestQueryTimestamp = queryState.fulfilledTimeStamp;
        collection = foundCollection;
      }
    }
  }

  return collection;
};
