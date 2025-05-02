import Users from "metabase/entities/users";
import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";

import { CLEAR_TEMPORARY_PASSWORD } from "./events";

// ACTION CREATORS

export const clearTemporaryPassword = createAction(CLEAR_TEMPORARY_PASSWORD);

// REDUCERS

const temporaryPasswords = handleActions(
  {
    [Users.actionTypes.CREATE]: {
      next: (state, { payload }) => ({
        ...state,
        [payload.id]: payload.password,
      }),
    },
    [Users.actionTypes.PASSWORD_RESET_MANUAL]: {
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

export default combineReducers({ temporaryPasswords });
