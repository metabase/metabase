import { createAction, createReducer } from "@reduxjs/toolkit";

import { userApi } from "metabase/api/user";
import Dashboards from "metabase/entities/dashboards";
import Users from "metabase/entities/users";
import { createAsyncThunk } from "metabase/lib/redux";
import { CLOSE_QB_NEWB_MODAL } from "metabase/query_builder/actions";
import type { CurrentUser, User } from "metabase-types/api";

export const refreshCurrentUser = createAsyncThunk(
  "metabase/user/REFRESH_CURRENT_USER",
  async (_, { dispatch, fulfillWithValue }) => {
    try {
      await dispatch(userApi.endpoints.getCurrentUser.initiate());
    } catch (e) {
      return fulfillWithValue(null);
    }
  },
);

export const loadCurrentUser = createAsyncThunk(
  "metabase/user/LOAD_CURRENT_USER",
  async (_, { dispatch, getState }) => {
    if (!getState().currentUser) {
      await dispatch(refreshCurrentUser());
    }
  },
);

// update current user with provided value
export const updateCurrentUser = createAction<CurrentUser>(
  "metabase/user/UPDATE_CURRENT_USER",
);

export const clearCurrentUser = createAction(
  "metabase/user/CLEAR_CURRENT_USER",
);

export const currentUser = createReducer<User | null>(null, builder => {
  builder
    .addCase(clearCurrentUser, () => null)
    .addCase(refreshCurrentUser.fulfilled, (state, action) => action.payload)
    .addCase(CLOSE_QB_NEWB_MODAL, state => {
      if (state) {
        state.is_qbnewb = false;
        return state;
      }
      return state;
    })
    .addCase(Users.actionTypes.UPDATE, (state, { payload }) => {
      const isCurrentUserUpdated = state?.id === payload.user.id;
      if (isCurrentUserUpdated) {
        return {
          ...state,
          ...payload.user,
        };
      }
      return state;
    })
    .addCase(Dashboards.actionTypes.UPDATE, (state, { payload }) => {
      const { dashboard } = payload;
      if (
        state != null &&
        state.custom_homepage?.dashboard_id === dashboard.id &&
        dashboard.archived
      ) {
        state.custom_homepage = null;
      }
    })
    .addCase(updateCurrentUser, (_state, { payload: currentUser }) => {
      return currentUser;
    });
});
