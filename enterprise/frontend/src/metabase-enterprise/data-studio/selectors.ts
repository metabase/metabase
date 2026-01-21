import {
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { State } from "metabase-types/store";

// Must be in sync with CanAccessDataStudio in frontend/src/metabase/route-guards.tsx
export function canAccessDataStudio(state: State) {
  if (getIsEmbeddingIframe(state)) {
    return false;
  }
  return (
    getUserIsAdmin(state) ||
    PLUGIN_TRANSFORMS.canAccessTransforms(state) ||
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state)
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

  const isRemoteSyncReadOnly = getIsRemoteSyncReadOnly(state);

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

  const isRemoteSyncReadOnly = getIsRemoteSyncReadOnly(state);

  return !isRemoteSyncReadOnly || !isTablePublished;
};
