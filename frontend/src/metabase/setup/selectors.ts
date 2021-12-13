import { createSelector } from "reselect";
import { LocaleData } from "./types";

export const getState = (state: any) => state.setup;

export const getStep = (state: any) => getState(state).step;

export const getLocale = (state: any) => getState(state).locale;

export const getSettings = (state: any) => state.settings.values;

export const getLocales = createSelector([getSettings], settings => {
  const data = settings["available-locales"] ?? [["en", "English"]];
  return data.map(([code, name]: LocaleData) => ({ code, name }));
});
