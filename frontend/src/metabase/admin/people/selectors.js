import { createSelector } from "@reduxjs/toolkit";
import { getSetting } from "metabase/selectors/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { ACTIVE_USERS_NUDGE_THRESHOLD } from "metabase/admin/people/constants";

export const getMemberships = state => state.admin.people.memberships;

export const getMembershipsList = createSelector(
  [getMemberships],
  memberships => Object.values(memberships) || [],
);

export const getGroupMembersips = createSelector(
  [getMembershipsList, (_state, props) => props.group.id],
  (membershipsList, groupId) =>
    membershipsList.filter(membership => membership.group_id === groupId),
);

export const getMembershipsByUser = createSelector(
  [getMembershipsList],
  membershipsList =>
    membershipsList?.reduce((acc, membership) => {
      acc[membership.user_id] ??= [];
      acc[membership.user_id].push(membership);
      return acc;
    }, {}),
);

export const getUserMemberships = createSelector(
  [(_, props) => props.userId, getMemberships],
  (userId, memberships) =>
    memberships && Object.values(memberships).filter(m => m.user_id === userId),
);

export const getUserTemporaryPassword = (state, props) =>
  state.admin.people.temporaryPasswords[props.userId];

export const shouldNudgeToPro = createSelector(
  state => getSetting(state, "premium-embedding-token"),
  state => getUserIsAdmin(state),
  state => getSetting(state, "active-users-count"),
  (premiumToken, isAdmin, numActiveUsers) => {
    return (
      !premiumToken && isAdmin && numActiveUsers >= ACTIVE_USERS_NUDGE_THRESHOLD
    );
  },
);
