import { getValues } from "redux-form";
import { createSelector } from "reselect";
import { COMPLETED_STEP } from "./constants";
import { Locale, UserInfo, DatabaseInfo, InviteInfo } from "./types";

export const getStep = (state: any): number => {
  return state.setup.step;
};

export const getLocale = (state: any): Locale => {
  return state.setup.locale;
};

export const getUser = (state: any): UserInfo | undefined => {
  return state.setup.user;
};

export const getUserEmail = (state: any): string | undefined => {
  return getUser(state)?.email;
};

export const getDatabase = (state: any): DatabaseInfo | undefined => {
  return state.setup.database;
};

export const getInvite = (state: any): InviteInfo | undefined => {
  return state.setup.invite;
};

export const isTrackingAllowed = (state: any): boolean => {
  return state.setup.isTrackingAllowed;
};

export const isStepActive = (state: any, step: number): boolean => {
  return getStep(state) === step;
};

export const isStepCompleted = (state: any, step: number): boolean => {
  return getStep(state) > step;
};

export const isSetupCompleted = (state: any): boolean => {
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
