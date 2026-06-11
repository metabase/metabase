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
