import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { getAllDescendantIds } from "metabase/common/components/tree/utils";
import { useSetting } from "metabase/common/hooks";
import { buildCollectionTree } from "metabase/entities/collections";

import { useGitSyncVisible } from "./use-git-sync-visible";
import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

export function useHasTransformDirtyChanges(): boolean {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const transformsSetting = useSetting("remote-sync-transforms");
  const { dirty, isDirty } = useRemoteSyncDirtyState();

  // Fetch transforms-namespace collections to check for dirty collections
  const { data: transformsCollections = [] } = useListCollectionsTreeQuery(
    { namespace: "transforms" },
    { skip: !isGitSyncVisible || !transformsSetting },
  );

  return useMemo(() => {
    // Only show if git sync is visible and transforms setting is enabled
    if (!isGitSyncVisible || !transformsSetting || !isDirty) {
      return false;
    }

    // Build set of transforms-namespace collection IDs
    const transformsTree = buildCollectionTree(transformsCollections);
    const transformsCollectionIds = getAllDescendantIds(transformsTree);
    const numericCollectionIds = new Set(
      [...transformsCollectionIds].filter(
        (id): id is number => typeof id === "number",
      ),
    );

    // Check if any dirty entity is:
    // 1. A transform, transform tag, or Python library
    // 2. A collection in the transforms namespace
    return dirty.some((entity) => {
      if (
        entity.model === "transform" ||
        entity.model === "transformtag" ||
        entity.model === "pythonlibrary"
      ) {
        return true;
      }
      if (
        entity.model === "collection" &&
        numericCollectionIds.has(entity.id)
      ) {
        return true;
      }
      return false;
    });
  }, [
    isGitSyncVisible,
    transformsSetting,
    dirty,
    isDirty,
    transformsCollections,
  ]);
}
