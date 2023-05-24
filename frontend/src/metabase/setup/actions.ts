import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import { SetupApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";
import { DatabaseData } from "metabase-types/api";
import { InviteInfo, Locale, State, UserInfo } from "metabase-types/store";
import {
  trackAddDataLaterClicked,
  trackDatabaseSelected,
  trackDatabaseStepCompleted,
  trackPreferencesStepCompleted,
  trackSetupCompleted,
  trackTrackingChanged,
  trackUserStepCompleted,
  trackWelcomeStepCompleted,
} from "./analytics";
import { getDefaultLocale, getLocales, getUserToken } from "./utils";

export const LOAD_USER_DEFAULTS = "metabase/setup/LOAD_USER_DEFAULTS";
export const loadUserDefaults = createAsyncThunk(
  LOAD_USER_DEFAULTS,
  async (): Promise<UserInfo | undefined> => {
    const token = getUserToken();
    if (token) {
      const defaults = await SetupApi.user_defaults({ token });
      return defaults.user;
    }
  },
);

export const LOAD_LOCALE_DEFAULTS = "metabase/setup/LOAD_LOCALE_DEFAULTS";
export const loadLocaleDefaults = createAsyncThunk(
  LOAD_LOCALE_DEFAULTS,
  async () => {
    const data = MetabaseSettings.get("available-locales") || [];
    return getDefaultLocale(getLocales(data));
  },
);

export const LOAD_DEFAULTS = "metabase/setup/LOAD_DEFAULTS";
export const loadDefaults = createAsyncThunk(LOAD_DEFAULTS, (_, thunkAPI) => {
  thunkAPI.dispatch(loadUserDefaults());
  thunkAPI.dispatch(loadLocaleDefaults());
});

export const SELECT_STEP = "metabase/setup/SUBMIT_WELCOME_STEP";
export const selectStep = createAction<number>(SELECT_STEP);

export const SUBMIT_WELCOME = "metabase/setup/SUBMIT_WELCOME_STEP";
export const submitWelcome = createAsyncThunk(SUBMIT_WELCOME, () => {
  trackWelcomeStepCompleted();
});

export const UPDATE_LOCALE = "metabase/setup/UPDATE_LOCALE";
export const updateLocale = createAction<Locale>(UPDATE_LOCALE);

export const SUBMIT_LANGUAGE = "metabase/setup/SUBMIT_LANGUAGE";
export const submitLanguage = createAction(SUBMIT_LANGUAGE);

export const submitUser = createAsyncThunk(
  "metabase/setup/SUBMIT_USER_INFO",
  (user: UserInfo) => {
    trackUserStepCompleted();
    return user;
  },
);

export const UPDATE_DATABASE_ENGINE = "metabase/setup/UPDATE_DATABASE_ENGINE";
export const updateDatabaseEngine = createAsyncThunk(
  UPDATE_DATABASE_ENGINE,
  (engine?: string) => {
    if (engine) {
      trackDatabaseSelected(engine);
    }
    return engine;
  },
);

export const validateDatabase = async (database: DatabaseData) => {
  await SetupApi.validate_db({
    token: MetabaseSettings.get("setup-token"),
    details: database,
  });
};

export const SUBMIT_DATABASE = "metabase/setup/SUBMIT_DATABASE";
export const submitDatabase = createAsyncThunk(
  SUBMIT_DATABASE,
  async (database: DatabaseData) => {
    const sslDetails = { ...database.details, ssl: true };
    const sslDatabase = { ...database, details: sslDetails };
    const nonSslDetails = { ...database.details, ssl: false };
    const nonSslDatabase = { ...database, database: nonSslDetails };

    try {
      await validateDatabase(sslDatabase);
      trackDatabaseStepCompleted(sslDatabase.engine);
      return sslDatabase;
    } catch (error) {
      await validateDatabase(nonSslDatabase);
      trackDatabaseStepCompleted(nonSslDatabase.engine);
      return nonSslDatabase;
    }
  },
);

export const SUBMIT_USER_INVITE = "metabase/setup/SUBMIT_USER_INVITE";
export const submitUserInvite = createAsyncThunk(
  SUBMIT_USER_INVITE,
  (invite: InviteInfo) => {
    trackDatabaseStepCompleted();
    return invite;
  },
);

export const CANCEL_DATABASE_STEP = "metabase/setup/CANCEL_DATABASE_STEP";
export const cancelDatabaseStep = createAsyncThunk(
  CANCEL_DATABASE_STEP,
  (engine?: string) => {
    trackDatabaseStepCompleted();
    trackAddDataLaterClicked(engine);
  },
);

export const UPDATE_TRACKING = "metabase/setup/UPDATE_TRACKING";
export const updateTracking = createAsyncThunk(
  UPDATE_TRACKING,
  (isTrackingAllowed: boolean) => {
    trackTrackingChanged(isTrackingAllowed);
    MetabaseSettings.set("anon-tracking-enabled", isTrackingAllowed);
    trackTrackingChanged(isTrackingAllowed);
    return isTrackingAllowed;
  },
);

export const SUBMIT_SETUP = "metabase/setup/SUBMIT_SETUP";
export const submitSetup = createAsyncThunk(
  SUBMIT_SETUP,
  async (_, thunkAPI) => {
    const { setup } = thunkAPI.getState() as State;
    const { locale, user, database, invite, isTrackingAllowed } = setup;

    await SetupApi.create({
      token: MetabaseSettings.get("setup-token"),
      user,
      database,
      invite,
      prefs: {
        site_name: user?.site_name,
        site_locale: locale?.code,
        allow_tracking: isTrackingAllowed.toString(),
      },
    });

    MetabaseSettings.set("setup-token", null);
  },
);

export const SUBMIT_PREFERENCES = "metabase/setup/SUBMIT_PREFERENCES_STEP";
export const submitPreferencesStep = createAsyncThunk(
  SUBMIT_PREFERENCES,
  async (isTrackingAllowed: boolean, thunkAPI) => {
    await thunkAPI.dispatch(submitSetup());
    trackPreferencesStepCompleted(isTrackingAllowed);
    trackSetupCompleted();
  },
);
