import {
  type ThunkDispatch,
  type UnknownAction,
  createAction,
  createReducer,
} from "@reduxjs/toolkit";

import { sessionApi } from "metabase/api";
import type { State } from "metabase/redux/store";
import { createAsyncThunk, createThunkAction } from "metabase/redux/utils";
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

export const UPDATE_SETTING = "metabase/admin/settings/UPDATE_SETTING";
export const updateSetting = createThunkAction(
  UPDATE_SETTING,
  function (setting: { key: string; value: unknown }) {
    return async function (dispatch: any) {
      try {
        await SettingsApi.put(setting);
      } catch (error) {
        console.error("error updating setting", setting, error);
        throw error;
      } finally {
        await dispatch(refreshSiteSettings());
      }
    };
  },
);

export const reloadSettings =
  () => async (dispatch: ThunkDispatch<State, unknown, UnknownAction>) => {
    await dispatch(refreshSiteSettings());
  };

export const INITIALIZE_SETTINGS =
  "metabase/admin/settings/INITIALIZE_SETTINGS";
export const initializeSettings = createThunkAction(
  INITIALIZE_SETTINGS,
  () => async (dispatch) => {
    try {
      await dispatch(reloadSettings());
    } catch (error) {
      console.error("error fetching settings", error);
      throw error;
    }
  },
);

export const UPDATE_SETTINGS = "metabase/admin/settings/UPDATE_SETTINGS";
export const updateSettings = createThunkAction(
  UPDATE_SETTINGS,
  function (settings) {
    return async function (dispatch) {
      try {
        await SettingsApi.putAll(settings);
      } catch (error) {
        console.error("error updating settings", settings, error);
        throw error;
      } finally {
        await dispatch(reloadSettings());
      }
    };
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
