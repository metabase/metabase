import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";

import { refreshSiteSettings } from "metabase/redux/settings";
import { SettingsApi } from "metabase/services";
import { createThunkAction } from "metabase/utils/redux";
import type { SettingDefinition, SettingKey } from "metabase-types/api";
import type { State } from "metabase-types/store";

// ACTION TYPES AND ACTION CREATORS

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

export const isSettingSetFromEnvVar = <SettingName extends SettingKey>(
  settingDetails: SettingDefinition<SettingName> | undefined,
): settingDetails is SettingDefinition<SettingName> &
  Required<
    Pick<SettingDefinition<SettingName>, "is_env_setting" | "env_name">
  > => !!settingDetails?.is_env_setting && !!settingDetails?.env_name;
