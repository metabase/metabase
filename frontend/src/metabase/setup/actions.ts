import { createAction } from "redux-actions";
import { SetupApi, UtilApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { UserInfo, DatabaseInfo } from "./types";

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

export const VALIDATE_DATABASE = "metabase/setup/VALIDATE_DATABASE";
export const validateDatabase = createThunkAction(
  VALIDATE_DATABASE,
  (database: DatabaseInfo) => async (dispatch: any) => {
    await SetupApi.validate_db({
      token: Settings.get("setup-token"),
      details: database,
    });
  },
);
