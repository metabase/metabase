import { createAction, createAsyncThunk } from "@reduxjs/toolkit";

import {
  removeShowEmbedHomepageFlag,
  setShowEmbedHomepageFlag,
} from "metabase/home/utils";
import { loadLocalization } from "metabase/lib/i18n";
import MetabaseSettings from "metabase/lib/settings";
import { SetupApi } from "metabase/services";
import type { DatabaseData, UsageReason } from "metabase-types/api";
import type { InviteInfo, Locale, State, UserInfo } from "metabase-types/store";

import {
  trackAddDataLaterClicked,
  trackDatabaseSelected,
  trackLicenseTokenStepSubmitted,
  trackTrackingChanged,
  trackUsageReasonSelected,
} from "./analytics";
import {
  getAvailableLocales,
  getDatabase,
  getInvite,
  getIsTrackingAllowed,
  getLocale,
  getNextStep,
  getSetupToken,
  getUsageReason,
  getUser,
} from "./selectors";
import type { SetupStep } from "./types";
import { getDefaultLocale, getLocales, getUserToken } from "./utils";

interface ThunkConfig {
  state: State;
}

export const goToNextStep = createAsyncThunk(
  "metabase/setup/goToNextStep",
  async (_, { getState, dispatch }) => {
    const state = getState() as State;
    const nextStep = getNextStep(state);
    dispatch(selectStep(nextStep));
  },
);

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
export const loadLocaleDefaults = createAsyncThunk<
  Locale | undefined,
  void,
  ThunkConfig
>(LOAD_LOCALE_DEFAULTS, async (_, { getState }) => {
  const data = getAvailableLocales(getState());
  const locale = getDefaultLocale(getLocales(data));
  if (locale) {
    await loadLocalization(locale.code);
  }
  return locale;
});

export const LOAD_DEFAULTS = "metabase/setup/LOAD_DEFAULTS";
export const loadDefaults = createAsyncThunk<void, void, ThunkConfig>(
  LOAD_DEFAULTS,
  (_, { dispatch }) => {
    dispatch(loadUserDefaults());
    dispatch(loadLocaleDefaults());
  },
);

export const SELECT_STEP = "metabase/setup/SUBMIT_WELCOME_STEP";
export const selectStep = createAction<SetupStep>(SELECT_STEP);

export const UPDATE_LOCALE = "metabase/setup/UPDATE_LOCALE";
export const updateLocale = createAsyncThunk(
  UPDATE_LOCALE,
  async (locale: Locale) => {
    await loadLocalization(locale.code);
  },
);

export const SUBMIT_LANGUAGE = "metabase/setup/SUBMIT_LANGUAGE";
export const submitLanguage = createAction(SUBMIT_LANGUAGE);

export const submitUser = createAsyncThunk(
  "metabase/setup/SUBMIT_USER_INFO",
  (_: UserInfo, { dispatch }) => {
    dispatch(goToNextStep());
  },
);

export const submitUsageReason = createAsyncThunk(
  "metabase/setup/SUBMIT_USAGE_REASON",
  (usageReason: UsageReason, { dispatch }) => {
    trackUsageReasonSelected(usageReason);
    dispatch(goToNextStep());
  },
);

export const submitLicenseToken = createAsyncThunk(
  "metabase/setup/SUBMIT_LICENSE_TOKEN",
  (token: string | null, { dispatch }) => {
    dispatch(goToNextStep());
    trackLicenseTokenStepSubmitted(Boolean(token));
  },
);

export const UPDATE_DATABASE_ENGINE = "metabase/setup/UPDATE_DATABASE_ENGINE";
export const updateDatabaseEngine = createAsyncThunk(
  UPDATE_DATABASE_ENGINE,
  (engine?: string) => {
    if (engine) {
      trackDatabaseSelected(engine);
    }
  },
);

const validateDatabase = async (token: string, database: DatabaseData) => {
  await SetupApi.validate_db({
    token,
    details: database,
  });
};

export const SUBMIT_DATABASE = "metabase/setup/SUBMIT_DATABASE";
export const submitDatabase = createAsyncThunk<
  DatabaseData,
  DatabaseData,
  ThunkConfig
>(
  SUBMIT_DATABASE,
  async (database: DatabaseData, { getState, dispatch, rejectWithValue }) => {
    const token = getSetupToken(getState());
    const sslDetails = { ...database.details, ssl: true };
    const sslDatabase = { ...database, details: sslDetails };
    const nonSslDetails = { ...database.details, ssl: false };
    const nonSslDatabase = { ...database, database: nonSslDetails };

    if (!token) {
      return database;
    }

    try {
      await validateDatabase(token, sslDatabase);
      dispatch(goToNextStep());
      return sslDatabase;
    } catch (error1) {
      try {
        await validateDatabase(token, nonSslDatabase);
        dispatch(goToNextStep());
        return nonSslDatabase;
      } catch (error2) {
        return rejectWithValue(error2);
      }
    }
  },
);

export const SUBMIT_USER_INVITE = "metabase/setup/SUBMIT_USER_INVITE";
export const submitUserInvite = createAsyncThunk(
  SUBMIT_USER_INVITE,
  (_: InviteInfo, { dispatch }) => {
    dispatch(goToNextStep());
  },
);

export const SKIP_DATABASE = "metabase/setup/SKIP_DATABASE";
export const skipDatabase = createAsyncThunk(
  SKIP_DATABASE,
  (engine: string | undefined, { dispatch }) => {
    trackAddDataLaterClicked(engine);
    dispatch(goToNextStep());
  },
);

export const UPDATE_TRACKING = "metabase/setup/UPDATE_TRACKING";
export const updateTracking = createAsyncThunk(
  UPDATE_TRACKING,
  (isTrackingAllowed: boolean) => {
    trackTrackingChanged(isTrackingAllowed);
    MetabaseSettings.set("anon-tracking-enabled", isTrackingAllowed);
    trackTrackingChanged(isTrackingAllowed);
  },
);

export const SUBMIT_SETUP = "metabase/setup/SUBMIT_SETUP";
export const submitSetup = createAsyncThunk<void, void, ThunkConfig>(
  SUBMIT_SETUP,
  async (_, { getState, rejectWithValue }) => {
    const token = getSetupToken(getState());
    const locale = getLocale(getState());
    const user = getUser(getState());
    const database = getDatabase(getState());
    const invite = getInvite(getState());
    const isTrackingAllowed = getIsTrackingAllowed(getState());
    const usageReason = getUsageReason(getState());
    const licenseToken = getState().setup.licenseToken;

    try {
      await SetupApi.create({
        token,
        user,
        database,
        invite,
        prefs: {
          site_name: user?.site_name,
          site_locale: locale?.code,
          allow_tracking: isTrackingAllowed.toString(),
        },
        license_token: licenseToken ?? undefined,
      });

      if (usageReason === "embedding" || usageReason === "both") {
        setShowEmbedHomepageFlag();
      } else {
        // make sure that state is clean in case of more than one setup on the same browser
        removeShowEmbedHomepageFlag();
      }

      MetabaseSettings.set("setup-token", null);
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);
