import { createSelector } from "@reduxjs/toolkit";

import { getUser, getUserIsAdmin } from "metabase/current-user";
import type { State } from "metabase/redux/store";
import { getPlan, getSetting, getTokenFeature } from "metabase/settings";

export const canAccessTransforms = (state: State): boolean => {
  if (getUserIsAdmin(state)) {
    return true;
  }
  const user = getUser(state);
  return user?.permissions?.can_access_transforms ?? false;
};

export const getShouldShowTransformsUpsell = createSelector(
  (state: State) => getSetting(state, "is-hosted?"),
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
