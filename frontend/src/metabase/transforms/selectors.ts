import { createSelector } from "@reduxjs/toolkit";

import { getPlan } from "metabase/common/utils/plan";
import { getSetting } from "metabase/selectors/settings";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { getIsHosted, getTokenFeature } from "metabase/setup";
import type { State } from "metabase-types/store";

export const canAccessTransforms = (state: State): boolean => {
  if (getUserIsAdmin(state)) {
    return true;
  }
  const user = getUser(state);
  return user?.permissions?.can_access_transforms ?? false;
};

export const getTransformsFeatureAvailable = createSelector(
  (state: State) => getPlan(getSetting(state, "token-features")),
  (state: State) => getTokenFeature(state, "transforms"),
  (plan, feature) => {
    if (plan === "oss") {
      return true;
    }

    return feature;
  },
);

export const getShouldShowTransformsUpsell = createSelector(
  getIsHosted,
  (state: State) => getTokenFeature(state, "transforms"),
  (isHosted, hasTransformsFeature) => isHosted && !hasTransformsFeature,
);

export const getShouldShowPythonTransformsUpsell = createSelector(
  (state: State) => getTokenFeature(state, "transforms-python"),
  (state: State) => getPlan(getSetting(state, "token-features")),
  (hasPythonTransformsFeature, plan) => {
    return !hasPythonTransformsFeature && plan !== "oss";
  },
);
