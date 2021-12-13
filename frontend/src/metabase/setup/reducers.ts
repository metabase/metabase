import { handleActions } from "redux-actions";
import { SET_LOCALE, SET_STEP, SET_USER, SET_DATABASE } from "./actions";
import { WELCOME_STEP } from "./constants";

export const step = handleActions(
  {
    [SET_STEP]: { next: (state, { payload }) => payload },
  },
  WELCOME_STEP,
);

export const locale = handleActions(
  {
    [SET_LOCALE]: { next: (state, { payload }) => payload },
  },
  null,
);

export const user = handleActions(
  {
    [SET_USER]: { next: (state, { payload }) => payload },
  },
  {},
);

export const database = handleActions(
  {
    [SET_DATABASE]: { next: (state, { payload }) => payload },
  },
  {},
);

export default {
  step,
  locale,
  user,
  database,
};
