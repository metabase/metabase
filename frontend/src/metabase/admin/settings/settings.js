import { createThunkAction } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { SettingsApi } from "metabase/services";

// ACTION TYPES AND ACTION CREATORS

export const reloadSettings = () => async (dispatch) => {
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

export const UPDATE_SETTING = "metabase/admin/settings/UPDATE_SETTING";
export const updateSetting = createThunkAction(
  UPDATE_SETTING,
  function (setting) {
    return async function (dispatch) {
      try {
        await SettingsApi.put(setting);
      } catch (error) {
        console.error("error updating setting", setting, error);
        throw error;
      } finally {
        await dispatch(reloadSettings());
      }
    };
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
