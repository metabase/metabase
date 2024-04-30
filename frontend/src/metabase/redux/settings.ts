import { createAsyncThunk, createReducer } from "@reduxjs/toolkit";

import { createThunkAction } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { SessionApi, SettingsApi } from "metabase/services";
import type { UserSettings } from "metabase-types/api";

export const REFRESH_SITE_SETTINGS = "metabase/settings/REFRESH_SITE_SETTINGS";

export const refreshSiteSettings = createAsyncThunk(
  REFRESH_SITE_SETTINGS,
  async ({ locale }: { locale?: string } = {}) => {
    const settings = await SessionApi.properties(null, {
      // eslint-disable-next-line no-literal-metabase-strings -- Not a user facing string
      headers: locale ? { "X-Metabase-Locale": locale } : {},
    });
    MetabaseSettings.setAll(settings);
    return settings;
  },
);

export type UpdateUserSettingOptions = {
  shouldRefresh?: boolean;
};

export const UPDATE_USER_SETTING = "metabase/settings/UPDATE_USER_SETTING";
export const updateUserSetting = createThunkAction(
  UPDATE_USER_SETTING,
  function <K extends keyof UserSettings>(
    setting: {
      key: K;
      value: UserSettings[K];
    },
    { shouldRefresh = true }: UpdateUserSettingOptions = {},
  ) {
    return async function (dispatch) {
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
          await dispatch(refreshSiteSettings({}));
        }
      }
    };
  },
);

export const settings = createReducer(
  { values: window.MetabaseBootstrap || {}, loading: false },
  builder => {
    builder.addCase(refreshSiteSettings.pending, state => {
      state.loading = true;
    });
    builder.addCase(refreshSiteSettings.fulfilled, (state, { payload }) => {
      state.loading = false;
      state.values = payload;
    });
    builder.addCase(refreshSiteSettings.rejected, state => {
      state.loading = false;
    });
    builder.addCase(updateUserSetting.toString(), (state, { payload }) => {
      state.values[payload.key] = payload.value;
    });
  },
);
