import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";

import { SettingsApi, EmailApi, SlackApi, LdapApi } from "metabase/services";

import { refreshSiteSettings } from "metabase/redux/settings";

// ACITON TYPES AND ACTION CREATORS

export const reloadSettings = () => async (dispatch, getState) => {
  await Promise.all([
    dispatch(refreshSettingsList()),
    dispatch(refreshSiteSettings()),
  ]);
};

const REFRESH_SETTINGS_LIST = "metabase/admin/settings/REFRESH_SETTINGS_LIST";
export const refreshSettingsList = createAction(
  REFRESH_SETTINGS_LIST,
  async () => {
    const settingsList = await SettingsApi.list();
    return settingsList.map(setting => ({
      ...setting,
      originalValue: setting.value,
    }));
  },
);

export const INITIALIZE_SETTINGS =
  "metabase/admin/settings/INITIALIZE_SETTINGS";
export const initializeSettings = createThunkAction(
  INITIALIZE_SETTINGS,
  () => async (dispatch, getState) => {
    try {
      await dispatch(reloadSettings());
    } catch (error) {
      console.log("error fetching settings", error);
      throw error;
    }
  },
);

export const UPDATE_SETTING = "metabase/admin/settings/UPDATE_SETTING";
export const updateSetting = createThunkAction(UPDATE_SETTING, function(
  setting,
) {
  return async function(dispatch, getState) {
    try {
      await SettingsApi.put(setting);
    } catch (error) {
      console.log("error updating setting", setting, error);
      throw error;
    } finally {
      await dispatch(reloadSettings());
    }
  };
});

export const UPDATE_SETTINGS = "metabase/admin/settings/UPDATE_SETTINGS";
export const updateSettings = createThunkAction(UPDATE_SETTINGS, function(
  settings,
) {
  return async function(dispatch, getState) {
    try {
      await SettingsApi.putAll(settings);
    } catch (error) {
      console.log("error updating settings", settings, error);
      throw error;
    } finally {
      await dispatch(reloadSettings());
    }
  };
});

export const UPDATE_EMAIL_SETTINGS =
  "metabase/admin/settings/UPDATE_EMAIL_SETTINGS";
export const updateEmailSettings = createThunkAction(
  UPDATE_EMAIL_SETTINGS,
  function(settings) {
    return async function(dispatch, getState) {
      try {
        return await EmailApi.updateSettings(settings);
      } catch (error) {
        console.log("error updating email settings", settings, error);
        throw error;
      } finally {
        await dispatch(reloadSettings());
      }
    };
  },
);

export const SEND_TEST_EMAIL = "metabase/admin/settings/SEND_TEST_EMAIL";
export const sendTestEmail = createThunkAction(SEND_TEST_EMAIL, function() {
  return async function(dispatch, getState) {
    try {
      await EmailApi.sendTest();
    } catch (error) {
      console.log("error sending test email", error);
      throw error;
    }
  };
});

export const CLEAR_EMAIL_SETTINGS =
  "metabase/admin/settings/CLEAR_EMAIL_SETTINGS";

export const clearEmailSettings = createAction(CLEAR_EMAIL_SETTINGS, () =>
  EmailApi.clear(),
);

export const UPDATE_SLACK_SETTINGS =
  "metabase/admin/settings/UPDATE_SLACK_SETTINGS";
export const updateSlackSettings = createThunkAction(
  UPDATE_SLACK_SETTINGS,
  function(settings) {
    return async function(dispatch, getState) {
      try {
        await SlackApi.updateSettings(settings);
      } catch (error) {
        console.log("error updating slack settings", settings, error);
        throw error;
      } finally {
        await dispatch(reloadSettings());
      }
    };
  },
  {},
);

export const UPDATE_LDAP_SETTINGS =
  "metabase/admin/settings/UPDATE_LDAP_SETTINGS";
export const updateLdapSettings = createThunkAction(
  UPDATE_LDAP_SETTINGS,
  function(settings) {
    return async function(dispatch, getState) {
      try {
        await LdapApi.updateSettings(settings);
      } catch (error) {
        console.log("error updating LDAP settings", settings, error);
        throw error;
      } finally {
        await dispatch(reloadSettings());
      }
    };
  },
);

// REDUCERS

export const warnings = handleActions(
  {
    [UPDATE_EMAIL_SETTINGS]: {
      next: (state, { payload }) => payload["with-corrections"],
    },
  },
  {},
);

const settings = handleActions(
  {
    [REFRESH_SETTINGS_LIST]: { next: (state, { payload }) => payload },
  },
  [],
);

export default combineReducers({
  settings,
  warnings,
});
