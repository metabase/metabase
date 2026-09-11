import { getUserIsAdmin, getUserIsAnalyst } from "metabase/current-user";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { getTokenFeature } from "metabase/settings";
import { isWithinIframe } from "metabase/utils/iframe";

// Must be in sync with CanAccessDataStudio in frontend/src/metabase/data-studio/route-guards.tsx
// and with api/check-data-studio-access in src/metabase/api/common.clj
export function canAccessDataStudio(state: State) {
  if (isWithinIframe()) {
    return false;
  }
  if (getUserIsAdmin(state)) {
    return true;
  }
  return (
    getUserIsAnalyst(state) && getTokenFeature(state, "advanced_permissions")
  );
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
