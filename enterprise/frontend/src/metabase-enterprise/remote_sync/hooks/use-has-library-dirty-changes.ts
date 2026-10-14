import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import {
  buildCollectionTree,
  isLibraryCollection,
} from "metabase/common/collections/utils";
import { getAllDescendantIds } from "metabase/common/components/tree/utils";
import type { CollectionId } from "metabase-types/api";

import {
  buildNamespaceCollectionMap,
  getDisplayGroupId,
} from "../displayGroups";

import { useGitSyncVisible } from "./use-git-sync-visible";
import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

const isNumericId = (id: CollectionId): id is number => typeof id === "number";

const LIBRARY_DISPLAY_GROUP_IDS = new Set(["tables", "default"]);

export function useHasLibraryDirtyChanges(): boolean {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const { dirty, hasDirtyInCollectionTree, isDirty } =
    useRemoteSyncDirtyState();

  const { data: collections = [] } = useListCollectionsTreeQuery(
    {
      "exclude-other-user-collections": true,
      "exclude-archived": true,
      "include-library": true,
    },
    { skip: !isGitSyncVisible },
  );
  const { data: snippetsCollections = [] } = useListCollectionsTreeQuery(
    { namespace: "snippets" },
    { skip: !isGitSyncVisible },
  );
  const { data: dataActionsCollections = [] } = useListCollectionsTreeQuery(
    { namespace: "data-actions" },
    { skip: !isGitSyncVisible },
  );

  return useMemo(() => {
    if (!isDirty) {
      return false;
    }

    // Removed items have no collection to place them by, so any that no other tab owns show here
    const namespaceCollectionMap = buildNamespaceCollectionMap([
      ...snippetsCollections,
      ...dataActionsCollections,
    ]);
    const hasRemovedLibraryItems = dirty.some(
      (entity) =>
        entity.sync_status === "removed" &&
        LIBRARY_DISPLAY_GROUP_IDS.has(
          getDisplayGroupId(entity, namespaceCollectionMap),
        ),
    );
    if (hasRemovedLibraryItems) {
      return true;
    }

    const libraryCollection = collections.find(isLibraryCollection);
    if (!libraryCollection) {
      return false;
    }

    const libraryTree = buildCollectionTree([libraryCollection]);
    const libraryCollectionIds = getAllDescendantIds(libraryTree);
    const numericIds = new Set([...libraryCollectionIds].filter(isNumericId));

    return hasDirtyInCollectionTree(numericIds);
  }, [
    collections,
    snippetsCollections,
    dataActionsCollections,
    dirty,
    isDirty,
    hasDirtyInCollectionTree,
  ]);
}
