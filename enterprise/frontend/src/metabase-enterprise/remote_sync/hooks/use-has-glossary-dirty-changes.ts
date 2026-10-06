import { useMemo } from "react";

import { useGitSyncVisible } from "./use-git-sync-visible";
import { useRemoteSyncDirtyState } from "./use-remote-sync-dirty-state";

export function useHasGlossaryDirtyChanges(): boolean {
  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const { dirty, isDirty } = useRemoteSyncDirtyState();

  return useMemo(() => {
    if (!isGitSyncVisible || !isDirty) {
      return false;
    }
    return dirty.some((entity) => entity.model === "glossary");
  }, [isGitSyncVisible, isDirty, dirty]);
}
