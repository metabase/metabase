import { getUserIsAdmin } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";

export const getIsRemoteSyncReadOnly = (state: State): boolean =>
  Boolean(getSetting(state, "remote-sync-enabled")) &&
  getSetting(state, "remote-sync-type") === "read-only";

export const getIsRemoteSyncVisible = (state: State): boolean =>
  getUserIsAdmin(state) &&
  Boolean(getSetting(state, "remote-sync-enabled")) &&
  Boolean(getSetting(state, "remote-sync-branch")) &&
  getSetting(state, "remote-sync-type") === "read-write";
