import { createReducer } from "@reduxjs/toolkit";

import { sessionApi } from "metabase/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { SettingsApi } from "metabase/services";
import type { UserSettings } from "metabase-types/api";

// Re-export loadSettings from settings-actions to maintain backwards compatibility
// (loadSettings is in a separate file to avoid circular dependency with metabase/api/session)
import { loadSettings } from "./settings-actions";

export { loadSettings };

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

export const settings = createReducer(
  // note: this sets the initial state to the current values in the window object
  // this is necessary so that we never have empty settings
  { values: window.MetabaseBootstrap || {}, loading: false },
  (builder) => {
    builder
      .addCase(refreshSiteSettings.pending, (state) => {
        state.loading = true;
      })
      .addCase(refreshSiteSettings.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(refreshSiteSettings.rejected, (state) => {
        state.loading = false;
      })
      .addCase(loadSettings, (state, { payload }) => {
        state.loading = false;
        state.values = payload;
      })
      .addCase(updateUserSetting.fulfilled, (state, { payload }) => {
        if (payload) {
          state.values[payload.key] = payload.value;
        }
      });
  },
);
