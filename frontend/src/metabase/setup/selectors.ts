import { createSelector } from "reselect";
import { LocaleData } from "./types";

export const getSettings = createSelector(
  (state: any) => state.settings,
  settings => settings.values,
);

export const getLocales = createSelector([getSettings], settings => {
  const data = settings["available-locales"] ?? [["en", "English"]];
  return data.map(([code, name]: LocaleData) => ({ code, name }));
});
