import { createAction } from "@reduxjs/toolkit";

import { sessionApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { SettingsApi } from "metabase/services";
import type { Settings, UserSettings } from "metabase-types/api";
export const REFRESH_SITE_SETTINGS = "metabase/settings/REFRESH_SITE_SETTINGS";

export const refreshSiteSettings = createAsyncThunk(
  REFRESH_SITE_SETTINGS,
  async (_, { dispatch }) => {
    const response = await dispatch(
      sessionApi.endpoints.getSessionProperties.initiate(undefined, {
        forceRefetch: true,
      }),
    );
    return response.data;
  },
);

export const loadSettings = createAction<Settings>(
  "metabase/settings/LOAD_SETTINGS",
);

interface UpdateUserSettingProps<K extends keyof UserSettings> {
  key: K;
  value: UserSettings[K];
  shouldRefresh?: boolean;
}

export const UPDATE_USER_SETTING = "metabase/settings/UPDATE_USER_SETTING";
export const updateUserSetting = createAsyncThunk(
  UPDATE_USER_SETTING,
  async (
    {
      key,
      value,
      shouldRefresh = true,
    }: UpdateUserSettingProps<keyof UserSettings>,
    { dispatch },
  ) => {
    const setting = {
      key,
      value,
    };
    try {
      await SettingsApi.put(setting);
      if (!shouldRefresh) {
        // When we aren't refreshing all the settings, we need to put the setting into the state
        return setting;
      }
    } catch (error) {
      console.error("error updating user setting", setting, error);
      throw error;
    } finally {
      if (shouldRefresh) {
        await dispatch(refreshSiteSettings());
      }
    }
  },
);
