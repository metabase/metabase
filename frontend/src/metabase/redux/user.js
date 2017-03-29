/* @flow */

import { createAction, handleActions, createThunkAction } from "metabase/lib/redux";

import { CLOSE_QB_NEWB_MODAL } from "metabase/query_builder/actions";

import { UserApi } from "metabase/services";

export const refreshCurrentUser = createAction("REFRESH_CURRENT_USER", () => {
    try {
        return UserApi.current();
    } catch (e) {
        return null;
    }
});

export const loadCurrentUser = createThunkAction("LOAD_CURRENT_USER", () =>
    async (dispatch, getState) => {
        if (!getState().currentUser) {
            await dispatch(refreshCurrentUser());
        }
    }
)

export const currentUser = handleActions({
    ["REFRESH_CURRENT_USER"]: { next: (state, { payload }) => payload },
    ["AUTH_LOGOUT"]: { next: (state, { payload }) => null },
    [CLOSE_QB_NEWB_MODAL]: { next: (state, { payload }) => ({ ...state, is_qbnewb: false }) },
}, null);
