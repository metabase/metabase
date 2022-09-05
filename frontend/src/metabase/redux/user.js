import {
  createAction,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { UserApi } from "metabase/services";
import { CLOSE_QB_NEWB_MODAL } from "metabase/query_builder/actions";
import Users from "metabase/entities/users";

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
    [CLEAR_CURRENT_USER]: { next: (state, payload) => null },
    [REFRESH_CURRENT_USER]: { next: (state, { payload }) => payload },
    [CLOSE_QB_NEWB_MODAL]: {
      next: (state, { payload }) => ({ ...state, is_qbnewb: false }),
    },
    [Users.actionTypes.UPDATE]: {
      next: (state, { payload }) => {
        const isCurrentUserUpdated = state.id === payload.user.id;
        if (isCurrentUserUpdated) {
          return {
            ...state,
            ...payload.user,
          };
        }
        return state;
      },
    },
  },
  null,
);
