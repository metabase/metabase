import { getUserIsAdmin, getUserIsAnalyst } from "metabase/current-user";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { isWithinIframe } from "metabase/utils/iframe";

export function canAccessDataStudio(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  return getUserIsAdmin(state) || getUserIsAnalyst(state);
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
