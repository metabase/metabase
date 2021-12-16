import { getValues } from "redux-form";
import { createSelector } from "reselect";
import { COMPLETED_STEP } from "./constants";
import { Locale, UserInfo, DatabaseInfo } from "./types";

export const getStep = (state: any): number => {
  return state.setup.step;
};

export const getLocale = (state: any): Locale => {
  return state.setup.locale;
};

export const getUser = (state: any): UserInfo | undefined => {
  return state.setup.user;
};

export const getDatabase = (state: any): DatabaseInfo | undefined => {
  return state.setup.database;
};

export const isTrackingAllowed = (state: any): boolean => {
  return state.setup.isTrackingAllowed;
};

export const isStepActive = (state: any, step: number): boolean => {
  return getStep(state) === step;
};

export const isStepFilled = (state: any, step: number): boolean => {
  return getStep(state) > step;
};

export const isStepCompleted = (state: any): boolean => {
  return getStep(state) === COMPLETED_STEP;
};

export const getDatabaseFields = createSelector(
  (state: any) => state.form.database,
  form => getValues(form),
);

export const getDatabaseEngine = createSelector(
  [getDatabaseFields],
  fields => fields?.engine,
);
