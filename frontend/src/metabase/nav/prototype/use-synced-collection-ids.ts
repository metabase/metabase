import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import type { Collection, CollectionId } from "metabase-types/api";

function addSyncedCollectionIds(
  collections: Collection[],
  isInsideSynced: boolean,
  ids: Set<CollectionId>,
) {
  for (const collection of collections) {
    const isSynced = isInsideSynced || collection.is_remote_synced === true;
    if (isSynced) {
      ids.add(collection.id);
    }
    addSyncedCollectionIds(collection.children ?? [], isSynced, ids);
  }
}

/**
 * PROTOTYPE: IDs of collections synced from git (the Library included) and
 * everything inside them, for keeping "Official" and "Saved" content
 * apart.
 */
export function useSyncedCollectionIds({ skip = false } = {}) {
  // Same args as the main nav's tree, so this reuses its cached response.
  const { data: collectionTree } = useListCollectionsTreeQuery(
    {
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    },
    { skip },
  );

  return useMemo(() => {
    const ids = new Set<CollectionId>();
    addSyncedCollectionIds(collectionTree ?? [], false, ids);
    return ids;
  }, [collectionTree]);
}
