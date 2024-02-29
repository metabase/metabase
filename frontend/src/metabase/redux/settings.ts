import { createAsyncThunk, createReducer } from "@reduxjs/toolkit";

import { createThunkAction } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { SessionApi, SettingsApi } from "metabase/services";

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

export const settings = createReducer(
  { values: window.MetabaseBootstrap, loading: false },
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
  },
);

export const UPDATE_USER_SETTING = "metabase/settings/UPDATE_USER_SETTING";
export const updateUserSetting = createThunkAction(
  UPDATE_USER_SETTING,
  function (setting) {
    return async function (dispatch) {
      try {
        await SettingsApi.put(setting);
      } catch (error) {
        console.error("error updating user setting", setting, error);
        throw error;
      } finally {
        await dispatch(refreshSiteSettings({}));
      }
    };
  },
);
