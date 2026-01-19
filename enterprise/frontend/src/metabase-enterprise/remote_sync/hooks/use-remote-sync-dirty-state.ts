import { useCallback, useMemo } from "react";

import type { RemoteSyncEntity } from "metabase-types/api";

import { useGetRemoteSyncChangesQuery } from "../../api";

import { useGitSyncVisible } from "./use-git-sync-visible";

export interface RemoteSyncDirtyState {
  /** Array of all dirty entities */
  dirty: RemoteSyncEntity[];
  /** Map of collection IDs that have dirty child entities */
  changedCollections: Record<number, boolean>;
  /** Whether any dirty changes exist globally */
  isDirty: boolean;
  /** Whether any entities have "removed" status */
  hasRemovedItems: boolean;
  /** Whether data is loading */
  isLoading: boolean;
  /** Check if a specific collection has dirty items */
  isCollectionDirty: (collectionId: number | string | undefined) => boolean;
  /** Check if any collection in a set has dirty items */
  hasAnyCollectionDirty: (collectionIds: Set<number> | number[]) => boolean;
  /** Check if any dirty entity (including collections) is in the given set of IDs */
  hasDirtyInCollectionTree: (collectionIds: Set<number>) => boolean;
  /** Refetch the dirty state data */
  refetch: () => ReturnType<
    ReturnType<typeof useGetRemoteSyncChangesQuery>["refetch"]
  >;
}

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
