import { createAction } from "redux-actions";
import { updateIn, getIn } from "icepick";
import { SetupApi, UtilApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { getUserToken, getDefaultLocale, getLocales } from "./utils";
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

export const LOAD_USER_DEFAULTS = "metabase/setup/LOAD_USER_DEFAULTS";
export const loadUserDefaults = createThunkAction(
  LOAD_USER_DEFAULTS,
  () => async (dispatch: any) => {
    const token = getUserToken();
    if (token) {
      const defaults = await SetupApi.user_defaults({ token });
      dispatch(setUser(defaults.user));
    }
  },
);

export const LOAD_LOCALE_DEFAULTS = "metabase/setup/LOAD_LOCALE_DEFAULTS";
export const loadLocaleDefaults = createThunkAction(
  LOAD_LOCALE_DEFAULTS,
  () => async (dispatch: any) => {
    const data = Settings.get("available-locales");
    const locale = getDefaultLocale(getLocales(data));
    dispatch(setLocale(locale));
  },
);

export const VALIDATE_PASSWORD = "metabase/setup/VALIDATE_PASSWORD";
export const validatePassword = createThunkAction(
  VALIDATE_PASSWORD,
  (user: UserInfo) => async () => {
    try {
      await UtilApi.password_check({ password: user.password });
    } catch (error) {
      throw getIn(error, ["data", "errors"]);
    }
  },
);

export const VALIDATE_DATABASE = "metabase/setup/VALIDATE_DATABASE";
export const validateDatabase = createThunkAction(
  VALIDATE_DATABASE,
  (database: DatabaseInfo) => async () => {
    await SetupApi.validate_db({
      token: Settings.get("setup-token"),
      details: database,
    });
  },
);

export const SUBMIT_DATABASE = "metabase/setup/SUBMIT_DATABASE";
export const submitDatabase = createThunkAction(
  SUBMIT_DATABASE,
  (database: DatabaseInfo) => async (dispatch: any) => {
    const sslDetails = { ...database.details, ssl: true };
    const sslDatabase = { ...database, details: sslDetails };
    const nonSslDetails = { ...database.details, ssl: false };
    const nonSslDatabase = { ...database, database: nonSslDetails };

    try {
      await dispatch(validateDatabase(sslDatabase));
      await dispatch(setDatabase(sslDatabase));
    } catch (error) {
      try {
        await dispatch(validateDatabase(nonSslDatabase));
        await dispatch(setDatabase(nonSslDatabase));
      } catch (error) {
        throw updateIn(error, ["data", "errors"], errors => ({
          details: errors,
        }));
      }
    }
  },
);

export const SUBMIT_SETUP = "metabase/setup/SUBMIT_SETUP";
export const submitSetup = createThunkAction(
  SUBMIT_SETUP,
  () => async (dispatch: any, getState: any) => {
    const { setup } = getState();
    const { locale, user, database, isTrackingAllowed } = setup;

    await SetupApi.create({
      token: Settings.get("setup-token"),
      user,
      database,
      prefs: {
        site_name: user.site_name,
        site_locale: locale.code,
        allow_tracking: isTrackingAllowed.toString(),
      },
    });

    Settings.set("setup-token", null);
  },
);
