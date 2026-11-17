import { getUserIsAdmin } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";

export function getIsRemoteSyncReadOnly(state: State): boolean {
  return (
    Boolean(getSetting(state, "remote-sync-enabled")) &&
    getSetting(state, "remote-sync-type") === "read-only"
  );
}

export function getIsRemoteSyncVisible(state: State): boolean {
  return (
    getUserIsAdmin(state) &&
    Boolean(getSetting(state, "remote-sync-enabled")) &&
    Boolean(getSetting(state, "remote-sync-branch")) &&
    getSetting(state, "remote-sync-type") === "read-write"
  );
}
