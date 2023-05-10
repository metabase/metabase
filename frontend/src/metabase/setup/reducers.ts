import { handleActions } from "redux-actions";
import {
  SET_LOCALE,
  SET_STEP,
  SET_USER,
  SET_DATABASE_ENGINE,
  SET_DATABASE,
  SET_TRACKING,
  SET_INVITE,
  SET_LOCALE_LOADED,
} from "./actions";
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
  null,
);

export const databaseEngine = handleActions(
  {
    [SET_DATABASE_ENGINE]: { next: (state, { payload }) => payload },
  },
  null,
);

export const database = handleActions(
  {
    [SET_DATABASE]: { next: (state, { payload }) => payload },
  },
  null,
);

export const invite = handleActions(
  {
    [SET_INVITE]: { next: (state, { payload }) => payload },
  },
  null,
);

export const isLocaleLoaded = handleActions(
  {
    [SET_LOCALE]: { next: () => false },
    [SET_LOCALE_LOADED]: { next: () => true },
  },
  false,
);

export const isTrackingAllowed = handleActions(
  {
    [SET_TRACKING]: { next: (state, { payload }) => payload },
  },
  true,
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default {
  step,
  locale,
  user,
  database,
  databaseEngine,
  invite,
  isLocaleLoaded,
  isTrackingAllowed,
};
