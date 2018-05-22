/* @flow */

import {
  createAction,
  handleActions,
  createThunkAction,
} from "metabase/lib/redux";

import { CLOSE_QB_NEWB_MODAL } from "metabase/query_builder/actions";
import { LOGOUT } from "metabase/auth/auth";

import { UserApi } from "metabase/services";

export const REFRESH_CURRENT_USER = "metabase/user/REFRESH_CURRENT_USER";
export const refreshCurrentUser = createAction(REFRESH_CURRENT_USER, () => {
  try {
    return UserApi.current();
  } catch (e) {
    return null;
  }
});

export const LOAD_CURRENT_USER = "metabase/user/LOAD_CURRENT_USER";
export const loadCurrentUser = createThunkAction(
  LOAD_CURRENT_USER,
  () => async (dispatch, getState) => {
    if (!getState().currentUser) {
      await dispatch(refreshCurrentUser());
    }
  },
);

export const CLEAR_CURRENT_USER = "metabase/user/CLEAR_CURRENT_USER";
export const clearCurrentUser = createAction(CLEAR_CURRENT_USER);

export const currentUser = handleActions(
  {
    [LOGOUT]: { next: (state, { payload }) => null },
    [CLEAR_CURRENT_USER]: { next: (state, payload) => null },
    [REFRESH_CURRENT_USER]: { next: (state, { payload }) => payload },
    [CLOSE_QB_NEWB_MODAL]: {
      next: (state, { payload }) => ({ ...state, is_qbnewb: false }),
    },
  },
  null,
);
