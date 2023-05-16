import { createAction } from "redux-actions";
import { getIn } from "icepick";
import { SetupApi, UtilApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";
import { loadLocalization } from "metabase/lib/i18n";
import MetabaseSettings from "metabase/lib/settings";
import { DatabaseData } from "metabase-types/api";
import { Locale } from "metabase-types/store";
import { getUserToken, getDefaultLocale, getLocales } from "./utils";

export const SET_STEP = "metabase/setup/SET_STEP";
export const setStep = createAction(SET_STEP);

export const SET_LOCALE = "metabase/setup/SET_LOCALE";
export const SET_LOCALE_LOADED = "metabase/setup/SET_LOCALE_LOADED";
export const setLocale = createThunkAction(
  SET_LOCALE_LOADED,
  (locale: Locale) => async (dispatch: any) => {
    dispatch({ type: SET_LOCALE, payload: locale });
    await loadLocalization(locale.code);
  },
);

export const SET_USER = "metabase/setup/SET_USER";
export const setUser = createAction(SET_USER);

export const SET_DATABASE_ENGINE = "metabase/setup/SET_DATABASE_ENGINE";
export const setDatabaseEngine = createAction(SET_DATABASE_ENGINE);

export const SET_DATABASE = "metabase/setup/SET_DATABASE";
export const setDatabase = createAction(SET_DATABASE);

export const SET_INVITE = "metabase/setup/SET_INVITE";
export const setInvite = createAction(SET_INVITE);

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
    const data = MetabaseSettings.get("available-locales") || [];
    const locale = getDefaultLocale(getLocales(data));
    await dispatch(setLocale(locale));
  },
);

export const validatePassword = async (password: string) => {
  const error = MetabaseSettings.passwordComplexityDescription(password);
  if (error) {
    return error;
  }

  try {
    await UtilApi.password_check({ password });
  } catch (error) {
    return getIn(error, ["data", "errors", "password"]);
  }
};

export const VALIDATE_DATABASE = "metabase/setup/VALIDATE_DATABASE";
export const validateDatabase = createThunkAction(
  VALIDATE_DATABASE,
  (database: DatabaseData) => async () => {
    await SetupApi.validate_db({
      token: MetabaseSettings.get("setup-token"),
      details: database,
    });
  },
);

export const SUBMIT_DATABASE = "metabase/setup/SUBMIT_DATABASE";
export const submitDatabase = createThunkAction(
  SUBMIT_DATABASE,
  (database: DatabaseData) => async (dispatch: any) => {
    const sslDetails = { ...database.details, ssl: true };
    const sslDatabase = { ...database, details: sslDetails };
    const nonSslDetails = { ...database.details, ssl: false };
    const nonSslDatabase = { ...database, database: nonSslDetails };

    try {
      await dispatch(validateDatabase(sslDatabase));
      await dispatch(setDatabase(sslDatabase));
    } catch (error) {
      await dispatch(validateDatabase(nonSslDatabase));
      await dispatch(setDatabase(nonSslDatabase));
    }
  },
);

export const SUBMIT_SETUP = "metabase/setup/SUBMIT_SETUP";
export const submitSetup = createThunkAction(
  SUBMIT_SETUP,
  () => async (dispatch: any, getState: any) => {
    const { setup } = getState();
    const { locale, user, database, invite, isTrackingAllowed } = setup;

    await SetupApi.create({
      token: MetabaseSettings.get("setup-token"),
      user,
      database,
      invite,
      prefs: {
        site_name: user.site_name,
        site_locale: locale.code,
        allow_tracking: isTrackingAllowed.toString(),
      },
    });

    MetabaseSettings.set("setup-token", null);
  },
);
