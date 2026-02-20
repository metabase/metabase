import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

// Must be in sync with UserCanAccessDataStudioGuard in routing compat guards.
export function canAccessDataStudio(state: State) {
  if (getIsEmbeddingIframe(state)) {
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
