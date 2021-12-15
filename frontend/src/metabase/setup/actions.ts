import { createAction } from "redux-actions";
import { getIn } from "icepick";
import { createThunkAction } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { UtilApi } from "metabase/services";
import { UserInfo, Locale } from "./types";

export const SET_STEP = "metabase/setup/SET_STEP";
export const setStep = createAction(SET_STEP);

export const SET_LOCALE = "metabase/setup/SET_LOCALE";
export const setLocale = createThunkAction(
  SET_LOCALE,
  (locale: Locale) => async () => {
    Settings.set("user-locale", locale.code);
    return locale;
  },
);

export const SET_USER = "metabase/setup/SET_USER";
export const setUser = createAction(SET_USER);

export const VALIDATE_PASSWORD = "metabase/setup/VALIDATE_PASSWORD";
export const validatePassword = createThunkAction(
  VALIDATE_PASSWORD,
  (user: UserInfo) => async () => {
    try {
      await UtilApi.password_check({ password: user.password });
      return {};
    } catch (error) {
      return getIn(error, ["data", "errors"]);
    }
  },
);

export const SET_DATABASE = "metabase/setup/SET_DATABASE";
export const setDatabase = createAction(SET_DATABASE);
