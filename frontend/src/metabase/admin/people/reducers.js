import _ from "underscore";

import { handleActions } from 'redux-actions';

import {
    CREATE_USER,
    DELETE_USER,
    FETCH_USERS,
    GRANT_ADMIN,
    REVOKE_ADMIN,
    SHOW_MODAL,
    UPDATE_USER
} from './actions';


export const modal = handleActions({
    [SHOW_MODAL]: { next: (state, { payload }) => payload }
}, null);


export const users = handleActions({
    [FETCH_USERS]: { next: (state, { payload }) => ({ ...payload.entities.user }) },
    [CREATE_USER]: { next: (state, { payload: user }) => ({ ...state, [user.id]: user }) },
    [DELETE_USER]: { next: (state, { payload: user }) => _.omit(state, user.id) },
    [GRANT_ADMIN]: { next: (state, { payload: user }) => ({ ...state, [user.id]: user }) },
    [REVOKE_ADMIN]: { next: (state, { payload: user }) => ({ ...state, [user.id]: user }) },
    [UPDATE_USER]: { next: (state, { payload: user }) => ({ ...state, [user.id]: user }) }
}, null);
