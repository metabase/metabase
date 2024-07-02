import { createAction } from "@reduxjs/toolkit";
import { t } from "ttag";

import { createDatabase } from "metabase/admin/databases/database";
import { getSettings } from "metabase/admin/settings/selectors";
import {
  initializeSettings,
  updateSetting,
  updateSettings,
} from "metabase/admin/settings/settings";
import { loadLocalization } from "metabase/lib/i18n";
import { createAsyncThunk } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getSetting } from "metabase/selectors/settings";
import { SetupApi } from "metabase/services";
import type { DatabaseData, Settings, UsageReason } from "metabase-types/api";
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
  getInvite,
  getLocale,
  getNextStep,
  getSetupToken,
  getUsageReason,
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

export const submitUser = createAsyncThunk<void, UserInfo, ThunkConfig>(
  "metabase/setup/SUBMIT_USER_INFO",
  async (user: UserInfo, { dispatch, getState, rejectWithValue }) => {
    const token = getSetupToken(getState());
    const invite = getInvite(getState());
    const locale = getLocale(getState());

    try {
      await SetupApi.create({
        token,
        user,
        invite,
        prefs: {
          site_name: user.site_name,
          site_locale: locale?.code,
        },
      });
    } catch (error) {
      return rejectWithValue(error);
    }

    MetabaseSettings.set("setup-token", null);
    dispatch(goToNextStep());
    //  load the settings after the user is logged, needed later by setEmbeddingHomepageFlags
    dispatch(initializeSettings());
  },
);

export const submitUsageReason = createAsyncThunk(
  "metabase/setup/SUBMIT_USAGE_REASON",
  (usageReason: UsageReason, { dispatch }) => {
    trackUsageReasonSelected(usageReason);
    dispatch(goToNextStep());
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

export const SUBMIT_DATABASE = "metabase/setup/SUBMIT_DATABASE";
export const submitDatabase = createAsyncThunk<
  DatabaseData,
  DatabaseData,
  ThunkConfig
>(
  SUBMIT_DATABASE,
  async (database: DatabaseData, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(createDatabase(database));
      dispatch(goToNextStep());
      return database;
    } catch (error) {
      return rejectWithValue(error);
    }
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

export const SUBMIT_USER_INVITE = "metabase/setup/SUBMIT_USER_INVITE";
export const submitUserInvite = createAsyncThunk(
  SUBMIT_USER_INVITE,
  (_: InviteInfo, { dispatch }) => {
    dispatch(goToNextStep());
  },
);

export const submitLicenseToken = createAsyncThunk(
  "metabase/setup/SUBMIT_LICENSE_TOKEN",
  async (licenseToken: string | null, { dispatch, rejectWithValue }) => {
    try {
      if (licenseToken) {
        await dispatch(
          updateSetting({
            key: "premium-embedding-token",
            value: licenseToken,
          }),
        );
      }
      trackLicenseTokenStepSubmitted(Boolean(licenseToken));
    } catch (err) {
      return rejectWithValue(
        t`This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.`,
      );
    }

    dispatch(goToNextStep());
  },
);

export const UPDATE_TRACKING = "metabase/setup/UPDATE_TRACKING";
export const updateTracking = createAsyncThunk(
  UPDATE_TRACKING,
  async (isTrackingAllowed: boolean, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(
        updateSetting({
          key: "anon-tracking-enabled",
          value: isTrackingAllowed,
        }),
      );
      trackTrackingChanged(isTrackingAllowed);
      MetabaseSettings.set("anon-tracking-enabled", isTrackingAllowed);
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

export const SUBMIT_SETUP = "metabase/setup/SUBMIT_SETUP";
export const submitSetup = createAsyncThunk<void, void, ThunkConfig>(
  SUBMIT_SETUP,
  async (_, { dispatch }) => {
    dispatch(setEmbeddingHomepageFlags());
    dispatch(goToNextStep());
  },
);

export const setEmbeddingHomepageFlags = createAsyncThunk(
  "setup/setEmbeddingHomepageFlags",
  async (_, { getState, dispatch }) => {
    const usageReason = getUsageReason(getState());
    const tokenFeatures = getSetting(getState(), "token-features");
    const adminSettings = getSettings(getState());
    const enableEmbeddingSetByEnv = adminSettings.find(
      (setting: { key: string }) => setting.key === "enable-embedding",
    )?.is_env_setting;

    const interestedInEmbedding =
      usageReason === "embedding" || usageReason === "both";
    const isLicenseActive = tokenFeatures && tokenFeatures["embedding"];

    const settingsToChange: Partial<Settings> = {};

    if (interestedInEmbedding) {
      settingsToChange["embedding-homepage"] = "visible";
    }

    if (interestedInEmbedding && !enableEmbeddingSetByEnv) {
      settingsToChange["enable-embedding"] = true;
      settingsToChange["setup-embedding-autoenabled"] = true;
    }

    settingsToChange["setup-license-active-at-setup"] = isLicenseActive;

    dispatch(updateSettings(settingsToChange));
  },
);
