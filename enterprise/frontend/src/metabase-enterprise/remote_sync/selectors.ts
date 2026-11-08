import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";

export const getIsRemoteSyncReadOnly = (state: State): boolean =>
  Boolean(getSetting(state, "remote-sync-enabled")) &&
  getSetting(state, "remote-sync-type") === "read-only";
