import { createAction, createReducer } from "@reduxjs/toolkit";

import { userApi } from "metabase/api";
import { updateDashboard } from "metabase/api/dashboard";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { CLOSE_QB_NEWB_MODAL } from "metabase/redux/query-builder";
import { createAsyncThunk } from "metabase/redux/utils";
import type { User } from "metabase-types/api";

export const refreshCurrentUser = createAsyncThunk(
  "metabase/user/REFRESH_CURRENT_USER",
  // Let a failed request reject the thunk rather than fulfilling it with
  // `null`. A fulfilled `null` (e.g. from the 401 the bootstrap fetch gets on
  // the login page) makes the admin `paths` reducer permanently drop every
  // admin path, which it never restores once a real superuser logs in.
  (_, { dispatch }) =>
    runRtkEndpoint(undefined, dispatch, userApi.endpoints.getCurrentUser),
);

export const loadCurrentUser = createAsyncThunk(
  "metabase/user/LOAD_CURRENT_USER",
  async (_, { dispatch, getState }) => {
    if (!getState().currentUser) {
      await dispatch(refreshCurrentUser());
    }
  },
);

export const clearCurrentUser = createAction(
  "metabase/user/CLEAR_CURRENT_USER",
);
export const userUpdated = createAction<User>("metabase/user/UPDATED");

export const currentUser = createReducer<User | null>(null, (builder) => {
  builder
    .addCase(clearCurrentUser, () => null)
    .addCase(refreshCurrentUser.fulfilled, (state, action) => action.payload)
    .addCase(CLOSE_QB_NEWB_MODAL, (state) => {
      if (state) {
        state.is_qbnewb = false;
        return state;
      }
      return state;
    })
    .addCase(userUpdated, (state, { payload: user }) => {
      const isCurrentUserUpdated = user && state?.id === user.id;
      if (isCurrentUserUpdated) {
        return { ...state, ...user };
      }
      return state;
    })
    .addMatcher(
      userApi.endpoints.updateUser.matchFulfilled,
      (state, { payload: user }) => {
        // keep current user state in sync when the user updates themselves
        const isCurrentUserUpdated = user && state?.id === user.id;
        if (isCurrentUserUpdated) {
          return { ...state, ...user };
        }
        return state;
      },
    )
    .addMatcher(updateDashboard.matchFulfilled, (state, { payload }) => {
      if (
        state != null &&
        state.custom_homepage?.dashboard_id === payload.id &&
        payload.archived
      ) {
        state.custom_homepage = null;
      }
    });
});
