import { createSelector } from "@reduxjs/toolkit";

import { ACTIVE_USERS_NUDGE_THRESHOLD } from "metabase/admin/people/constants";
import { hasAnySsoFeature } from "metabase/common/utils/plan";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";

export const getMemberships = (state) => state.admin.people.memberships;

export const getUserTemporaryPassword = (state, props) =>
  state.admin.people.temporaryPasswords[props.userId];

export const shouldNudgeToPro = createSelector(
  (state) => getSetting(state, "token-features"),
  (state) => getUserIsAdmin(state),
  (state) => getSetting(state, "active-users-count"),
  (tokenFeatures, isAdmin, numActiveUsers) => {
    return (
      !hasAnySsoFeature(tokenFeatures) &&
      isAdmin &&
      numActiveUsers >= ACTIVE_USERS_NUDGE_THRESHOLD
    );
  },
);
