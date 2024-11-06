import { createReducer } from "@reduxjs/toolkit";
import _ from "underscore";

import { permissionApi } from "metabase/api";
import Users from "metabase/entities/users";
import {
  combineReducers,
  createAction,
  createAsyncThunk,
} from "metabase/lib/redux";
import { PermissionsApi } from "metabase/services";
import type { GroupUserMembership, Member, UserId } from "metabase-types/api";

import {
  CLEAR_TEMPORARY_PASSWORD,
  CREATE_MEMBERSHIP,
  DELETE_MEMBERSHIP,
  LOAD_MEMBERSHIPS,
  UPDATE_MEMBERSHIP,
} from "./events";
import { getMemberships } from "./selectors";

// ACTION CREATORS

export const loadMemberships = createAsyncThunk(LOAD_MEMBERSHIPS, async () => {
  const memberships: GroupUserMembership = await PermissionsApi.memberships();
  return Object.fromEntries(
    Object.values(memberships)
      .flat()
      .map(m => [m.membership_id, m]),
  );
});

export const createMembership = createAsyncThunk<
  Pick<Member, "user_id" | "group_id"> & { membership?: Member },
  { userId: Member["user_id"]; groupId: Member["group_id"] }
>(CREATE_MEMBERSHIP, async ({ userId, groupId }, { dispatch }) => {
  // pull the membership_id from the list of all memberships of the group
  const { data: groupMemberships = [] } = await dispatch(
    permissionApi.endpoints.createMembership.initiate({
      user_id: userId,
      group_id: groupId,
    }),
  );

  return {
    user_id: userId,
    group_id: groupId,
    membership: _.findWhere(groupMemberships, { user_id: userId }),
  };
});
export const deleteMembership = createAsyncThunk<
  { membershipId: Member["membership_id"]; groupId: Member["group_id"] },
  Member["membership_id"]
>(DELETE_MEMBERSHIP, async (membership_id, { dispatch, getState }) => {
  const memberships = getMemberships(getState());
  const membership = memberships[membership_id];
  await dispatch(
    permissionApi.endpoints.deleteMembership.initiate({
      membership_id,
      group_id: membership.group_id,
    }),
  );

  return { membershipId: membership_id, groupId: membership.group_id };
});

export const updateMembership = createAsyncThunk<Member, Member>(
  UPDATE_MEMBERSHIP,
  async (membership, { dispatch }) => {
    await dispatch(
      permissionApi.endpoints.updateMembership.initiate(membership),
    );

    return membership;
  },
);

export const clearTemporaryPassword = createAction<UserId>(
  CLEAR_TEMPORARY_PASSWORD,
);

// REDUCERS

const memberships = createReducer<
  Record<Member["membership_id"], Partial<Member>>
>({}, builder => {
  builder
    .addCase(loadMemberships.fulfilled, (state, action) => action.payload)
    .addCase(
      createMembership.fulfilled,
      (state, { payload: { group_id, user_id, membership } }) => {
        if (!membership) {
          return state;
        }
        state[membership.membership_id] = {
          group_id,
          user_id,
          membership_id: membership.membership_id,
        };
      },
    )
    .addCase(updateMembership.fulfilled, (state, { payload: membership }) => {
      state[membership.membership_id] = membership;
    })
    .addCase(deleteMembership.fulfilled, (state, { payload }) => {
      delete state[payload.membershipId];
    });
});

const temporaryPasswords = createReducer<Record<UserId, string | null>>(
  {},
  builder => {
    builder
      .addCase(Users.actionTypes.CREATE, (state, { payload }) => ({
        ...state,
        [payload.id]: payload.password,
      }))
      .addCase(
        Users.actionTypes.PASSWORD_RESET_MANUAL,
        (state, { payload }) => ({
          ...state,
          [payload.id]: payload.password,
        }),
      )
      .addCase(clearTemporaryPassword, (state, { payload }) => ({
        ...state,
        [payload]: null,
      }));
  },
);

// eslint-disable-next-line import/no-default-export
export default combineReducers({
  memberships,
  temporaryPasswords,
});
