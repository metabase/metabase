import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { Locale } from "./types";

export const SET_STEP = "metabase/setup/SET_STEP";
export const setStep = createAction(SET_STEP);

export const SET_LOCALE = "metabase/setup/SET_LOCALE";
export const setLocale = createThunkAction(SET_LOCALE, (locale: Locale) => {
  return () => {
    Settings.set("user-locale", locale.code);
    return locale;
  };
});

export const SET_USER = "metabase/setup/SET_USER";
export const setUser = createAction(SET_USER);
