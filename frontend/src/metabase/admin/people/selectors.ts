import { createSelector } from "@reduxjs/toolkit";

import { ACTIVE_USERS_NUDGE_THRESHOLD } from "metabase/admin/people/constants";
import { hasAnySsoFeature } from "metabase/common/utils/plan";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import type { Membership, UserId } from "metabase-types/api";
import type { State } from "metabase-types/store";

interface PeopleState {
  memberships?: Record<UserId, Membership[]>;
  temporaryPasswords: Record<UserId, string | null>;
}

interface AdminStateWithPeople {
  people: PeopleState;
}

interface StateWithPeople extends State {
  admin: State["admin"] & AdminStateWithPeople;
}

interface UserTemporaryPasswordProps {
  userId: UserId;
}

export const getMemberships = (
  state: StateWithPeople,
): Record<UserId, Membership[]> | undefined => 
  state.admin.people.memberships;

export const getUserTemporaryPassword = (
  state: StateWithPeople,
  props: UserTemporaryPasswordProps,
): string | null =>
  state.admin.people.temporaryPasswords[props.userId];

export const shouldNudgeToPro = createSelector(
  (state: State) => getSetting(state, "token-features"),
  (state: State) => getUserIsAdmin(state),
  (state: State) => getSetting(state, "active-users-count"),
  (tokenFeatures, isAdmin, numActiveUsers) => {
    return (
      !hasAnySsoFeature(tokenFeatures) &&
      isAdmin &&
      numActiveUsers >= ACTIVE_USERS_NUDGE_THRESHOLD
    );
  },
);
