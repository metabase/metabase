import { useMemo } from "react";

import { useListCollectionsTreeQuery } from "metabase/api";

import {
  buildNamespaceCollectionMap,
  getDisplayGroupId,
} from "../displayGroups";

import { useGitSyncVisible } from "./use-git-sync-visible";
import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

export function useHasDisplayGroupDirtyChanges(
  groupId: "snippets" | "data-actions",
): boolean {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const { dirty, isDirty } = useRemoteSyncDirtyState();
  const { data: collections = [] } = useListCollectionsTreeQuery(
    { namespace: groupId },
    { skip: !isGitSyncVisible },
  );

  return useMemo(() => {
    if (!isGitSyncVisible || !isDirty) {
      return false;
    }
    const namespaceCollectionMap = buildNamespaceCollectionMap(collections);
    return dirty.some(
      (entity) => getDisplayGroupId(entity, namespaceCollectionMap) === groupId,
    );
  }, [isGitSyncVisible, isDirty, dirty, collections, groupId]);
}

export function useHasSnippetsDirtyChanges(): boolean {
  return useHasDisplayGroupDirtyChanges("snippets");
}

export function useHasDataActionsDirtyChanges(): boolean {
  return useHasDisplayGroupDirtyChanges("data-actions");
}
