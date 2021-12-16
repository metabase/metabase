import { createAction } from "redux-actions";
import { createThunkAction } from "metabase/lib/redux";
import { UtilApi } from "metabase/services";
import { UserInfo } from "./types";

export const SET_STEP = "metabase/setup/SET_STEP";
export const setStep = createAction(SET_STEP);

export const SET_LOCALE = "metabase/setup/SET_LOCALE";
export const setLocale = createAction(SET_LOCALE);

export const SET_USER = "metabase/setup/SET_USER";
export const setUser = createAction(SET_USER);

export const SET_DATABASE = "metabase/setup/SET_DATABASE";
export const setDatabase = createAction(SET_DATABASE);

export const SET_TRACKING = "metabase/setup/SET_TRACKING";
export const setTracking = createAction(SET_TRACKING);

export const VALIDATE_PASSWORD = "metabase/setup/VALIDATE_PASSWORD";
export const validatePassword = createThunkAction(
  VALIDATE_PASSWORD,
  (user: UserInfo) => async () => {
    await UtilApi.password_check({ password: user.password });
  },
);
