import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { Transform } from "metabase-types/api";

/**
 * Whether read-only remote sync locks `transform` down. A worktree transform is an
 * admin's working copy of its branch, so read-only sync never applies to it.
 */
export const useIsTransformSyncReadOnly = (
  transform?: Pick<Transform, "worktree_id">,
): boolean => {
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  return isRemoteSyncReadOnly && transform?.worktree_id == null;
};
