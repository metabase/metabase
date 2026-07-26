import { createSelector } from "@reduxjs/toolkit";

import { getPlan } from "metabase/common/utils/plan";
import type { State } from "metabase/redux/store";
import {
  getIsHosted,
  getSetting,
  getTokenFeature,
} from "metabase/selectors/settings";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

export const canAccessTransforms = (state: State): boolean => {
  if (getUserIsAdmin(state)) {
    return true;
  }
  const user = getUser(state);
  return user?.permissions?.can_access_transforms ?? false;
};

/**
 * Whether the current user is operating inside a remote-sync workspace. Running transforms and
 * creating transform jobs are not allowed from within a workspace (the backend rejects them), so
 * the corresponding actions are disabled in the UI.
 */
export const getIsInWorkspace = (state: State): boolean => {
  const user = getUser(state);
  return user?.workspace_id != null;
};

export const getShouldShowTransformsUpsell = createSelector(
  getIsHosted,
  (state: State) => getTokenFeature(state, "transforms-basic"),
  (isHosted, hasTransformsFeature) => isHosted && !hasTransformsFeature,
);

export const getShouldShowPythonTransformsUpsell = createSelector(
  (state: State) => getTokenFeature(state, "transforms-python"),
  (state: State) => getPlan(getSetting(state, "token-features")),
  (hasPythonTransformsFeature, plan) => {
    return !hasPythonTransformsFeature && plan !== "oss";
  },
);
