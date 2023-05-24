import { createAsyncThunk } from "@reduxjs/toolkit";
import { SetupApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";
import { UserInfo } from "metabase-types/store";
import { trackStepSeen, trackWelcomeStepCompleted } from "./analytics";
import { WELCOME_STEP } from "./constants";
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

export const loadWelcomeStep = createAsyncThunk(
  "metabase/setup/LOAD_WELCOME_STEP",
  (_, thunkAPI) => {
    thunkAPI.dispatch(loadUserDefaults());
    thunkAPI.dispatch(loadLocaleDefaults());
    trackStepSeen(WELCOME_STEP);
  },
);

export const submitWelcomeStep = createAsyncThunk(
  "metabase/setup/SUBMIT_WELCOME_STEP",
  () => {
    trackWelcomeStepCompleted();
  },
);
