import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { isLibraryCollection } from "metabase/collections/utils";
import { getAllDescendantIds } from "metabase/common/components/tree/utils";
import { buildCollectionTree } from "metabase/entities/collections";

import { useGitSyncVisible } from "./use-git-sync-visible";
import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

export function useHasLibraryDirtyChanges(): boolean {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const { hasDirtyInCollectionTree, isDirty, hasRemovedItems } =
    useRemoteSyncDirtyState();

  const { data: collections = [] } = useListCollectionsTreeQuery(
    {
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    },
    { skip: !isGitSyncVisible },
  );

  return useMemo(() => {
    // Always show dirty if there are removed items
    if (hasRemovedItems) {
      return true;
    }

    if (!isDirty) {
      return false;
    }

    const libraryCollection = collections.find(isLibraryCollection);
    if (!libraryCollection) {
      return false;
    }

    // Build tree and get all descendant IDs (including Library itself)
    const libraryTree = buildCollectionTree([libraryCollection]);
    const libraryCollectionIds = getAllDescendantIds(libraryTree);

    // Filter to only numeric IDs for the dirty check
    const numericIds = new Set(
      [...libraryCollectionIds].filter(
        (id): id is number => typeof id === "number",
      ),
    );

    return hasDirtyInCollectionTree(numericIds);
  }, [collections, isDirty, hasRemovedItems, hasDirtyInCollectionTree]);
}
