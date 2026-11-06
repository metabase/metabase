import {
  getUserIsAdmin,
  getUserIsEntitledAnalyst,
} from "metabase/current-user";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { getSetting } from "metabase/settings";
import { isWithinIframe } from "metabase/utils/iframe";

// Must be in sync with api/check-data-studio-access in src/metabase/api/common.clj
// An iframe usually means an embedding host, which must not show Data Studio.
// `allow-data-studio-in-iframe` names the one host that may: MB Code's pane.
export function canAccessDataStudio(state: State) {
  if (isWithinIframe() && !getSetting(state, "allow-data-studio-in-iframe")) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsEntitledAnalyst(state);
}

export const getUserCanWriteSegments = (
  state: State,
  isTablePublished: boolean,
) => {
  const isAdmin = getUserIsAdmin(state);

  if (!isAdmin) {
    return false;
  }

  const isRemoteSyncReadOnly =
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly(state);

  return !isRemoteSyncReadOnly || !isTablePublished;
};

export const getUserCanWriteMeasures = (
  state: State,
  isTablePublished: boolean,
) => {
  const isAdmin = getUserIsAdmin(state);

  if (!isAdmin) {
    return false;
  }

  const isRemoteSyncReadOnly =
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly(state);

  return !isRemoteSyncReadOnly || !isTablePublished;
};
