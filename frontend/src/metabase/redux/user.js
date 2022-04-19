import {
  createAction,
  handleActions,
  createThunkAction,
} from "metabase/lib/redux";

import { CLOSE_QB_NEWB_MODAL } from "metabase/query_builder/actions";

import { UserApi } from "metabase/services";
import Settings from "metabase/lib/settings";
import { loadLocalization } from "metabase/lib/i18n";

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

export const LOAD_USER_LOCALIZATION = "metabase/user/LOAD_USER_LOCALIZATION";
export const loadUserLocalization = createThunkAction(
  LOAD_USER_LOCALIZATION,
  () => async (dispatch, getState) => {
    const user = getState().currentUser;
    if (user && user.locale) {
      await loadLocalization(user.locale);
    } else {
      await loadLocalization(Settings.get("site-locale"));
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
  },
  null,
);
