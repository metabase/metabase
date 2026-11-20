import { getUser, getUserIsAdmin } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

export function getCurrentWorktreeId(
  state: State,
): RemoteSyncWorktreeId | null {
  return getUser(state)?.worktree_id ?? null;
}

export function getIsRemoteSyncReadOnly(state: State): boolean {
  return (
    Boolean(getSetting(state, "remote-sync-enabled")) &&
    getSetting(state, "remote-sync-type") === "read-only" &&
    getCurrentWorktreeId(state) == null
  );
}

function getIsRemoteSyncConfigured(state: State): boolean {
  return (
    getUserIsAdmin(state) &&
    Boolean(getSetting(state, "remote-sync-enabled")) &&
    Boolean(getSetting(state, "remote-sync-branch"))
  );
}

export function getIsRemoteSyncVisible(state: State): boolean {
  return getIsRemoteSyncConfigured(state) && !getIsRemoteSyncReadOnly(state);
}

export function getIsWorktreesVisible(state: State): boolean {
  return (
    getIsRemoteSyncConfigured(state) &&
    Boolean(getSetting(state, "remote-sync-worktrees-enabled"))
  );
}
