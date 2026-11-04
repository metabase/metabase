import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";
import { buildCollectionTree } from "metabase/common/collections/utils";
import { getAllDescendantIds } from "metabase/common/components/tree/utils";

import { useGitSyncVisible } from "./use-git-sync-visible";
import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

const TRANSFORM_MODELS = new Set([
  "transform",
  "transformtag",
  "transformtest",
  "pythonlibrary",
]);

export function useHasTransformDirtyChanges(): boolean {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const { dirty, isDirty } = useRemoteSyncDirtyState();

  const { data: transformsCollections = [] } = useListCollectionsTreeQuery(
    { namespace: "transforms" },
    { skip: !isGitSyncVisible },
  );

  return useMemo(() => {
    if (!isGitSyncVisible || !isDirty) {
      return false;
    }

    const transformsTree = buildCollectionTree(transformsCollections);
    const transformsCollectionIds = getAllDescendantIds(transformsTree);
    const numericCollectionIds = new Set(
      [...transformsCollectionIds].filter(
        (id): id is number => typeof id === "number",
      ),
    );

    return dirty.some(
      (entity) =>
        TRANSFORM_MODELS.has(entity.model) ||
        (entity.model === "collection" && numericCollectionIds.has(entity.id)),
    );
  }, [isGitSyncVisible, dirty, isDirty, transformsCollections]);
}
