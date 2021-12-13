import { createSelector } from "reselect";
import _ from "underscore";
import { LocaleData } from "./types";

export const getState = (state: any) => {
  return state.setup;
};

export const getStep = (state: any) => {
  return getState(state).step;
};

export const isStepActive = (state: any, step: number) => {
  return getStep(state) === step;
};

export const isStepCompleted = (state: any, step: number) => {
  return getStep(state) > step;
};

export const getLocale = (state: any) => {
  return getState(state).locale;
};

export const getSettings = (state: any) => {
  return state.settings.values;
};

export const getLocales = createSelector([getSettings], settings => {
  const data = settings["available-locales"] ?? [["en", "English"]];
  const locales = data.map(([code, name]: LocaleData) => ({ code, name }));
  return _.sortBy(locales, locale => locale.name);
});
