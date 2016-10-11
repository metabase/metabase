import { createAction } from "redux-actions";
import { handleActions } from 'redux-actions';

import { CLOSE_QB_NEWB_MODAL } from "metabase/query_builder/actions";

export const setUser = createAction("SET_USER");

export const refreshCurrentUser = createAction("REFRESH_CURRENT_USER", async function getCurrentUser() {
    try {
        let response = await fetch("/api/user/current", { credentials: 'same-origin' });
        if (response.status === 200) {
            return await response.json();
        }
    } catch (e) {
        console.warn("couldn't get user", e)
    }
    return null;
})

export const currentUser = handleActions({
    ["SET_USER"]: { next: (state, { payload }) => payload },
    ["REFRESH_CURRENT_USER"]: { next: (state, { payload }) => payload },
    ["AUTH_LOGOUT"]: { next: (state, { payload }) => null },
    [CLOSE_QB_NEWB_MODAL]: { next: (state, { payload }) => ({ ...state, is_qbnewb: false }) },
}, null);
