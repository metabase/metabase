import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_REMOTE_SYNC,
} from "metabase/plugins";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/selectors/user";
import type { State } from "metabase-types/store";

// Must be in sync with CanAccessDataStudio in frontend/src/metabase/route-guards.tsx
export function canAccessDataStudio(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    getUserIsAnalyst(state) ||
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state)
  );
}

/**
 * Returns true for users who should see the full data studio (all tabs).
 * Users with only "Manage table metadata" permission should only see the Tables tab.
 */
export function canAccessFullDataStudio(state: State) {
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
