import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";

import { useWorktreeId } from "./WorktreeContext";

/**
 * Whether the content on the current page is frozen by Remote Sync's read-only
 * mode. The mode describes the main app's sync branch only: a worktree tracks
 * its own branch, so inside one the content stays editable regardless of the
 * setting, matching the backend's `transform-editable?` and `snippet-editable?`.
 */
export function useIsRemoteSyncReadOnly(): boolean {
  const isReadOnly = useSelector(PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly);
  const worktreeId = useWorktreeId();
  return isReadOnly && worktreeId == null;
}
