import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";

import { CLEAR_TEMPORARY_PASSWORD, STORE_TEMPORARY_PASSWORD } from "./events";

// ACTION CREATORS

export const clearTemporaryPassword = createAction(CLEAR_TEMPORARY_PASSWORD);

// REDUCERS

const temporaryPasswords = handleActions(
  {
    [STORE_TEMPORARY_PASSWORD]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: payload.password,
      }),
    },
    [CLEAR_TEMPORARY_PASSWORD]: {
      next: (state, { payload }) => ({
        ...state,
        [payload]: null,
      }),
    },
  },
  {},
);

export const people = combineReducers({ temporaryPasswords });
