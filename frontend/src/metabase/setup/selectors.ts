import { getValues } from "redux-form";
import { createSelector } from "reselect";

export const getStep = (state: any) => {
  return state.setup.step;
};

export const getLocale = (state: any) => {
  return state.setup.locale;
};

export const getUser = (state: any) => {
  return state.setup.user;
};

export const getDatabase = (state: any) => {
  return state.setup.database;
};

export const isTrackingAllowed = (state: any) => {
  return state.setup.isTrackingAllowed;
};

export const getDatabaseFields = createSelector(
  (state: any) => state.form.database,
  form => getValues(form),
);

export const getDatabaseEngine = createSelector(
  [getDatabaseFields],
  fields => fields.engine,
);
