import { createSelector } from "reselect";
import _ from "underscore";

import { isMetaBotGroup } from "metabase/lib/groups";

import Group from "metabase/entities/groups";

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

export const getGroupsWithoutMetabot = createSelector(
  [Group.selectors.getList],
  groups => groups.filter(group => !isMetaBotGroup(group)),
);

export const getIs = createSelector([Group.selectors.getList], groups =>
  groups.filter(group => !isMetaBotGroup(group)),
);

export const getUserMemberships = createSelector(
  [(_, props) => props.userId, getMemberships],
  (userId, memberships) =>
    memberships && Object.values(memberships).filter(m => m.user_id === userId),
);

export const getUserTemporaryPassword = (state, props) =>
  state.admin.people.temporaryPasswords[props.userId];
