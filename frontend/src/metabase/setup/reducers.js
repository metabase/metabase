import { handleActions } from "redux-actions";

import {
  SET_ACTIVE_STEP,
  SET_USER_DETAILS,
  SET_LANGUAGE_DETAILS,
  SET_DATABASE_DETAILS,
  SET_ALLOW_TRACKING,
  SUBMIT_SETUP,
  COMPLETE_SETUP,
} from "./actions";

export const activeStep = handleActions(
  {
    [SET_ACTIVE_STEP]: { next: (state, { payload }) => payload },
    [SET_USER_DETAILS]: { next: (state, { payload }) => payload.nextStep },
    [SET_LANGUAGE_DETAILS]: { next: (state, { payload }) => payload.nextStep },
    [SET_DATABASE_DETAILS]: { next: (state, { payload }) => payload.nextStep },
  },
  0,
);

export const userDetails = handleActions(
  {
    [SET_USER_DETAILS]: { next: (state, { payload }) => payload.details },
  },
  null,
);

export const databaseDetails = handleActions(
  {
    [SET_DATABASE_DETAILS]: { next: (state, { payload }) => payload.details },
  },
  null,
);

export const languageDetails = handleActions(
  {
    [SET_LANGUAGE_DETAILS]: { next: (state, { payload }) => payload.details },
  },
  null,
);

export const allowTracking = handleActions(
  {
    [SET_ALLOW_TRACKING]: { next: (state, { payload }) => payload },
  },
  true,
);

export const setupError = handleActions(
  {
    [SUBMIT_SETUP]: { next: (state, { payload }) => payload },
  },
  null,
);

export const setupComplete = handleActions(
  {
    [COMPLETE_SETUP]: { next: (state, { payload }) => true },
  },
  false,
);
