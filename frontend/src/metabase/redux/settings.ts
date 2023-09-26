import { createAsyncThunk, createReducer } from "@reduxjs/toolkit";

import MetabaseSettings from "metabase/lib/settings";

import { SessionApi } from "metabase/services";

export const REFRESH_SITE_SETTINGS = "metabase/settings/REFRESH_SITE_SETTINGS";

export const refreshSiteSettings = createAsyncThunk(
  REFRESH_SITE_SETTINGS,
  async ({ locale }: { locale?: string } = {}) => {
    const settings = await SessionApi.properties(null, {
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
