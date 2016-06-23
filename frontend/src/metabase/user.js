import { createAction } from "redux-actions";
import { handleActions } from 'redux-actions';


export const setUser = createAction("SET_USER");


export const currentUser = handleActions({
    ["SET_USER"]: { next: (state, { payload }) => payload }
}, null);
