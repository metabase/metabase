import { createAction, createAsyncThunk } from "@reduxjs/toolkit";
import { SetupApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";
import { Locale, State, UserInfo } from "metabase-types/store";
import {
  trackPreferencesStepCompleted,
  trackSetupCompleted,
  trackTrackingChanged,
  trackUserStepCompleted,
  trackWelcomeStepCompleted,
} from "./analytics";
import { getDefaultLocale, getLocales, getUserToken } from "./utils";

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

export const loadLocaleDefaults = createAsyncThunk(
  "metabase/setup/LOAD_LOCALE_DEFAULTS",
  async () => {
    const data = MetabaseSettings.get("available-locales") || [];
    return getDefaultLocale(getLocales(data));
  },
);

export const submitSetup = createAsyncThunk(
  "metabase/setup/SUBMIT_SETUP",
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

export const loadWelcomeStep = createAsyncThunk(
  "metabase/setup/LOAD_WELCOME_STEP",
  (_, thunkAPI) => {
    thunkAPI.dispatch(loadUserDefaults());
    thunkAPI.dispatch(loadLocaleDefaults());
  },
);

export const submitWelcomeStep = createAsyncThunk(
  "metabase/setup/SUBMIT_WELCOME_STEP",
  () => {
    trackWelcomeStepCompleted();
  },
);

export const changeLocale = createAction<Locale>(
  "metabase/setup/CHANGE_LOCALE",
);

export const selectLanguageStep = createAction(
  "metabase/setup/SELECT_LANGUAGE_STEP",
);

export const submitLanguageStep = createAction(
  "metabase/setup/SUBMIT_LANGUAGE_STEP",
);

export const selectUserStep = createAction("metabase/setup/SELECT_USER_STEP");

export const submitUserStep = createAsyncThunk(
  "metabase/setup/SUBMIT_USER_STEP",
  (user: UserInfo) => {
    trackUserStepCompleted();
    return user;
  },
);

export const changeTracking = createAsyncThunk(
  "metabase/setup/CHANGE_TRACKING",
  (isTrackingAllowed: boolean) => {
    trackTrackingChanged(isTrackingAllowed);
    MetabaseSettings.set("anon-tracking-enabled", isTrackingAllowed);
    trackTrackingChanged(isTrackingAllowed);
    return isTrackingAllowed;
  },
);

export const selectPreferencesStep = createAction(
  "metabase/setup/SELECT_PREFERENCES_STEP",
);

export const submitPreferencesStep = createAsyncThunk(
  "metabase/setup/SUBMIT_PREFERENCES_STEP",
  async (isTrackingAllowed: boolean, thunkAPI) => {
    await thunkAPI.dispatch(submitSetup());
    trackPreferencesStepCompleted(isTrackingAllowed);
    trackSetupCompleted();
  },
);
