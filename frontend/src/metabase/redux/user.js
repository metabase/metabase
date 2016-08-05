import { createAction } from "redux-actions";
import { handleActions } from 'redux-actions';

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

export default handleActions({
    ["REFRESH_CURRENT_USER"]:   { next: (state, { payload }) => payload },
    ["AUTH_LOGOUT"]:            { next: (state) => null },
    ["CLOSE_QB_NEWB_MODAL"]:    { next: (state) => state && { ...state, is_qbnewb: false } },
}, null);
