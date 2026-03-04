import { useCallback, useMemo } from "react";

import type { RemoteSyncDirtyState } from "metabase/plugins/oss/remote-sync";

import { useGetRemoteSyncChangesQuery } from "../../api";

import { useGitSyncVisible } from "./use-git-sync-visible";

export function useRemoteSyncDirtyState(): RemoteSyncDirtyState {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();

  const {
    data: dirtyData,
    isLoading,
    refetch,
  } = useGetRemoteSyncChangesQuery(undefined, {
    skip: !isGitSyncVisible,
    refetchOnFocus: true,
  });

  const dirty = useMemo(() => dirtyData?.dirty ?? [], [dirtyData?.dirty]);
  const changedCollections = useMemo(
    () => dirtyData?.changedCollections ?? {},
    [dirtyData?.changedCollections],
  );
  const isDirty = dirty.length > 0;
  const hasRemovedItems = useMemo(
    () => dirty.some((entity) => entity.sync_status === "removed"),
    [dirty],
  );

  const isCollectionDirty = useCallback(
    (collectionId: number | string | undefined) => {
      if (typeof collectionId !== "number") {
        return false;
      }
      return !!changedCollections[collectionId];
    },
    [changedCollections],
  );

  const hasAnyCollectionDirty = useCallback(
    (collectionIds: Set<number> | number[]) => {
      const ids =
        collectionIds instanceof Set ? collectionIds : new Set(collectionIds);
      for (const id of Object.keys(changedCollections)) {
        if (ids.has(Number(id))) {
          return true;
        }
      }
      return false;
    },
    [changedCollections],
  );

  const hasDirtyInCollectionTree = useCallback(
    (collectionIds: Set<number>) => {
      // Check changedCollections map (collections with dirty child entities)
      for (const id of Object.keys(changedCollections)) {
        if (collectionIds.has(Number(id))) {
          return true;
        }
      }
      // Check if any dirty collection itself is in the tree
      for (const entity of dirty) {
        if (entity.model === "collection" && collectionIds.has(entity.id)) {
          return true;
        }
      }
      return false;
    },
    [changedCollections, dirty],
  );

  return {
    dirty,
    changedCollections,
    isDirty,
    hasRemovedItems,
    isLoading,
    isCollectionDirty,
    hasAnyCollectionDirty,
    hasDirtyInCollectionTree,
    refetch,
  };
}
