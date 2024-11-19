import { assoc, dissoc } from "icepick";
import _ from "underscore";

import Users from "metabase/entities/users";
import {
  combineReducers,
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { PermissionsApi } from "metabase/services";

import {
  CLEAR_TEMPORARY_PASSWORD,
  CREATE_MEMBERSHIP,
  DELETE_MEMBERSHIP,
  LOAD_MEMBERSHIPS,
  UPDATE_MEMBERSHIP,
} from "./events";
import { getMemberships } from "./selectors";

// ACTION CREATORS

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
    const groupMemberships = await PermissionsApi.createMembership({
      user_id: userId,
      group_id: groupId,
    });

    return {
      user_id: userId,
      group_id: groupId,
      membership: _.findWhere(groupMemberships, { user_id: userId }),
    };
  },
);
export const deleteMembership = createThunkAction(
  DELETE_MEMBERSHIP,
  membershipId => async (_dispatch, getState) => {
    const memberships = getMemberships(getState());
    const membership = memberships[membershipId];
    await PermissionsApi.deleteMembership({ id: membershipId });

    return { membershipId, groupId: membership.group_id };
  },
);

export const updateMembership = createAction(
  UPDATE_MEMBERSHIP,
  async membership => {
    await PermissionsApi.updateMembership({
      ...membership,
      id: membership.membership_id,
    });

    return membership;
  },
);

export const clearTemporaryPassword = createAction(CLEAR_TEMPORARY_PASSWORD);

// REDUCERS

const memberships = handleActions(
  {
    [LOAD_MEMBERSHIPS]: {
      next: (state, { payload: memberships }) => memberships,
    },
    [CREATE_MEMBERSHIP]: {
      next: (state, { payload: { group_id, user_id, membership } }) =>
        assoc(state, membership.membership_id, {
          group_id,
          user_id,
          membership_id: membership.membership_id,
        }),
    },
    [UPDATE_MEMBERSHIP]: {
      next: (state, { payload: membership }) =>
        assoc(state, membership.membership_id, membership),
    },
    [DELETE_MEMBERSHIP]: {
      next: (state, { payload }) => dissoc(state, payload.membershipId),
    },
  },
  {},
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
    [CLEAR_TEMPORARY_PASSWORD]: {
      next: (state, { payload }) => ({
        ...state,
        [payload]: null,
      }),
    },
  },
  {},
);

export default combineReducers({
  memberships,
  temporaryPasswords,
});
