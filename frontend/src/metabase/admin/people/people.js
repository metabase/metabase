import {
  createAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { isMetaBotGroup } from "metabase/lib/groups";

import { PermissionsApi } from "metabase/services";

import _ from "underscore";
import { assoc, dissoc } from "icepick";

import Users from "metabase/entities/users";

export const LOAD_GROUPS = "metabase/admin/people/LOAD_GROUPS";
export const LOAD_MEMBERSHIPS = "metabase/admin/people/LOAD_MEMBERSHIPS";
export const LOAD_GROUP_DETAILS = "metabase/admin/people/LOAD_GROUP_DETAILS";

export const CREATE_MEMBERSHIP = "metabase/admin/people/CREATE_MEMBERSHIP";
export const DELETE_MEMBERSHIP = "metabase/admin/people/DELETE_MEMBERSHIP";

// action creators

export const loadGroups = createAction(LOAD_GROUPS, () =>
  PermissionsApi.groups(),
);

export const loadGroupDetails = createAction(LOAD_GROUP_DETAILS, id =>
  PermissionsApi.groupDetails({ id: id }),
);

export const loadMemberships = createAction(LOAD_MEMBERSHIPS, async () =>
  // flatten the map of user id => memberships
  _.chain(await PermissionsApi.memberships())
    .values()
    .flatten()
    .map(m => [m.membership_id, m])
    .object()
    .value(),
);
export const createMembership = createAction(
  CREATE_MEMBERSHIP,
  async ({ userId, groupId }) => {
    // pull the membership_id from the list of all memberships of the group
    let groupMemberships = await PermissionsApi.createMembership({
      user_id: userId,
      group_id: groupId,
    });
    MetabaseAnalytics.trackEvent("People Groups", "Membership Added");
    return {
      user_id: userId,
      group_id: groupId,
      membership_id: _.findWhere(groupMemberships, { user_id: userId })
        .membership_id,
    };
  },
);
export const deleteMembership = createAction(
  DELETE_MEMBERSHIP,
  async ({ membershipId }) => {
    await PermissionsApi.deleteMembership({ id: membershipId });
    MetabaseAnalytics.trackEvent("People Groups", "Membership Deleted");
    return membershipId;
  },
);

const groups = handleActions(
  {
    [LOAD_GROUPS]: {
      next: (state, { payload }) =>
        payload && payload.filter(group => !isMetaBotGroup(group)),
    },
  },
  null,
);

const memberships = handleActions(
  {
    [LOAD_MEMBERSHIPS]: {
      next: (state, { payload: memberships }) => memberships,
    },
    [CREATE_MEMBERSHIP]: {
      next: (state, { payload: membership }) =>
        assoc(state, membership.membership_id, membership),
    },
    [DELETE_MEMBERSHIP]: {
      next: (state, { payload: membershipId }) => dissoc(state, membershipId),
    },
  },
  {},
);

const group = handleActions(
  {
    [LOAD_GROUP_DETAILS]: { next: (state, { payload }) => payload },
  },
  null,
);

const temporaryPasswords = handleActions(
  {
    [Users.actionTypes.CREATE]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: payload.password,
      }),
    },
    [Users.actionTypes.PASSWORD_RESET_MANUAL]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: payload.password,
      }),
    },
  },
  {},
);

export default combineReducers({
  temporaryPasswords,
  groups,
  group,
  memberships,
});
