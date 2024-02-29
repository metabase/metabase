import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import { t } from "ttag";

import { createDatabase } from "metabase/admin/databases/database";
import { updateSetting } from "metabase/admin/settings/settings";
import {
  removeShowEmbedHomepageFlag,
  setShowEmbedHomepageFlag,
} from "metabase/home/utils";
import { loadLocalization } from "metabase/lib/i18n";
import MetabaseSettings from "metabase/lib/settings";
import { SetupApi, SettingsApi } from "metabase/services";
import type { DatabaseData, UsageReason } from "metabase-types/api";
import type { InviteInfo, Locale, State, UserInfo } from "metabase-types/store";

import {
  trackAddDataLaterClicked,
  trackDatabaseSelected,
  trackLicenseTokenStepSubmitted,
  trackUsageReasonSelected,
} from "./analytics";
import {
  getAvailableLocales,
  getInvite,
  getLocale,
  getNextStep,
  getSetupToken,
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

export const loadUserDefaults = createAsyncThunk(
  "metabase/setup/LOAD_USER_DEFAULTS",
  async (): Promise<UserInfo | undefined> => {
    const token = getUserToken();
    if (token) {
      const defaults = await SetupApi.user_defaults({ token });
      return defaults.user;
    }
  },
);

export const loadLocaleDefaults = createAsyncThunk<
  Locale | undefined,
  void,
  ThunkConfig
>("metabase/setup/LOAD_LOCALE_DEFAULTS", async (_, { getState }) => {
  const data = getAvailableLocales(getState());
  const locale = getDefaultLocale(getLocales(data));
  if (locale) {
    await loadLocalization(locale.code);
  }
  return locale;
});

export const loadDefaults = createAsyncThunk<void, void, ThunkConfig>(
  "metabase/setup/LOAD_DEFAULTS",
  (_, { dispatch }) => {
    dispatch(loadUserDefaults());
    dispatch(loadLocaleDefaults());
  },
);

export const selectStep = createAction<SetupStep>(
  "metabase/setup/SUBMIT_WELCOME_STEP",
);

export const updateLocale = createAsyncThunk(
  "metabase/setup/UPDATE_LOCALE",
  async (locale: Locale) => {
    await loadLocalization(locale.code);
  },
);

export const submitLanguage = createAction("metabase/setup/SUBMIT_LANGUAGE");

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
          site_name: user?.site_name,
          site_locale: locale?.code,
        },
      });
      MetabaseSettings.set("setup-token", null);
    } catch (error) {
      return rejectWithValue(error);
    }
    dispatch(goToNextStep());
  },
);

export const submitUsageReason = createAsyncThunk(
  "metabase/setup/SUBMIT_USAGE_REASON",
  (usageReason: UsageReason, { dispatch }) => {
    trackUsageReasonSelected(usageReason);
    if (usageReason === "embedding" || usageReason === "both") {
      setShowEmbedHomepageFlag();
    } else {
      // make sure that state is clean in case of more than one setup on the same browser
      removeShowEmbedHomepageFlag();
    }
    dispatch(goToNextStep());
  },
);

const INVALID_TOKEN_ERROR = t`This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.`;

export const submitLicenseToken = createAsyncThunk(
  "metabase/setup/SUBMIT_LICENSE_TOKEN",
  async (token: string | null, { dispatch, rejectWithValue }) => {
    dispatch(goToNextStep());
    trackLicenseTokenStepSubmitted(Boolean(token));
    try {
      await SettingsApi.put({
        key: "premium-embedding-token",
        value: token,
      });
    } catch (err) {
      console.error(err);
      return rejectWithValue(INVALID_TOKEN_ERROR);
    }
  },
);

export const updateDatabaseEngine = createAsyncThunk(
  "metabase/setup/UPDATE_DATABASE_ENGINE",
  (engine?: string) => {
    if (engine) {
      trackDatabaseSelected(engine);
    }
  },
);

export const submitDatabase = createAsyncThunk<
  DatabaseData,
  DatabaseData,
  ThunkConfig
>(
  "metabase/setup/SUBMIT_DATABASE",
  async (database: DatabaseData, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(createDatabase(database));
      dispatch(goToNextStep());
      return database;
    } catch (error: any) {
      const errMsg = error?.data?.message ?? error.toString();
      return rejectWithValue(errMsg);
    }
  },
);

export const submitUserInvite = createAsyncThunk(
  "metabase/setup/SUBMIT_USER_INVITE",
  (_: InviteInfo, { dispatch }) => {
    dispatch(goToNextStep());
  },
);

export const skipDatabase = createAsyncThunk(
  "metabase/setup/SKIP_DATABASE",
  (engine: string | undefined, { dispatch }) => {
    trackAddDataLaterClicked(engine);
    dispatch(goToNextStep());
  },
);

export const updateTracking = createAsyncThunk(
  "metabase/setup/UPDATE_TRACKING",
  async (isTrackingAllowed: boolean, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(
        updateSetting({
          key: "anon-tracking-enabled",
          value: isTrackingAllowed,
        }),
      );
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

export const completeSetup = createAction("metabase/setup/COMPLETE_SETUP");
