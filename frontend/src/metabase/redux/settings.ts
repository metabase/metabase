import { createAsyncThunk } from "@reduxjs/toolkit";
import MetabaseSettings from "metabase/lib/settings";
import {
  handleActions,
  createThunkAction,
  combineReducers,
} from "metabase/lib/redux";

import { SessionApi, SettingsApi } from "metabase/services";
import type { ToastKeys } from "metabase-types/api";
import { Dispatch, GetState } from "metabase-types/store";

export const REFRESH_SITE_SETTINGS = "metabase/settings/REFRESH_SITE_SETTINGS";

export const refreshSiteSettings = createThunkAction(
  REFRESH_SITE_SETTINGS,
  ({ locale }: { locale?: string } = {}) =>
    async (dispatch: Dispatch, getState: GetState) => {
      const settings = await SessionApi.properties(null, {
        headers: locale ? { "X-Metabase-Locale": locale } : {},
      });
      MetabaseSettings.setAll(settings);
      return settings;
    },
);

const values = handleActions(
  {
    [REFRESH_SITE_SETTINGS]: {
      next: (state, { payload }) => ({ ...state, ...payload }),
    },
  },
  // seed with setting values from MetabaseBootstrap
  window.MetabaseBootstrap,
);

export const DISMISS_TOAST = "metabase/settings/DISMISS_TOAST";
export const dismissToast = createAsyncThunk(
  DISMISS_TOAST,
  async (toastKey: ToastKeys, { dispatch }) => {
    await SettingsApi.put({
      key: toastKey,
      value: true,
    });
    await dispatch(refreshSiteSettings());
  },
);

export const settings = combineReducers({
  values,
});
