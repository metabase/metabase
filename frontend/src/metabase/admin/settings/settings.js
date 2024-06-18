import {
  createAction,
  createThunkAction,
  handleActions,
  combineReducers,
} from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import {
  SettingsApi,
  EmailApi,
  SlackApi,
  LdapApi,
  GoogleApi,
  SamlApi,
} from "metabase/services";

// ACTION TYPES AND ACTION CREATORS

export const reloadSettings = () => async (dispatch, getState) => {
  return await Promise.all([
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
    return async function (dispatch, getState) {
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

export const UPDATE_EMAIL_SETTINGS =
  "metabase/admin/settings/UPDATE_EMAIL_SETTINGS";
export const updateEmailSettings = createThunkAction(
  UPDATE_EMAIL_SETTINGS,
  function (settings) {
    return async function (dispatch, getState) {
      try {
        const result = await EmailApi.updateSettings(settings);
        await dispatch(reloadSettings());
        return result;
      } catch (error) {
        console.error("error updating email settings", settings, error);
        throw error;
      }
    };
  },
);

export const SEND_TEST_EMAIL = "metabase/admin/settings/SEND_TEST_EMAIL";
export const sendTestEmail = createThunkAction(SEND_TEST_EMAIL, function () {
  return async function (dispatch, getState) {
    try {
      await EmailApi.sendTest();
    } catch (error) {
      console.error("error sending test email", error);
      throw error;
    }
  };
});

export const CLEAR_EMAIL_SETTINGS =
  "metabase/admin/settings/CLEAR_EMAIL_SETTINGS";

export const clearEmailSettings = createThunkAction(
  CLEAR_EMAIL_SETTINGS,
  () => async dispatch => {
    await EmailApi.clear(), await dispatch(reloadSettings());
  },
);

export const UPDATE_SLACK_SETTINGS =
  "metabase/admin/settings/UPDATE_SLACK_SETTINGS";
export const updateSlackSettings = createThunkAction(
  UPDATE_SLACK_SETTINGS,
  function (settings) {
    return async function (dispatch) {
      const result = await SlackApi.updateSettings(settings);
      await dispatch(reloadSettings());
      return result;
    };
  },
  {},
);

export const UPDATE_LDAP_SETTINGS =
  "metabase/admin/settings/UPDATE_LDAP_SETTINGS";
export const updateLdapSettings = createThunkAction(
  UPDATE_LDAP_SETTINGS,
  function (settings) {
    return async function (dispatch) {
      const result = await LdapApi.updateSettings(settings);
      await dispatch(reloadSettings());
      return result;
    };
  },
);

export const UPDATE_SAML_SETTINGS =
  "metabase/admin/settings/UPDATE_SAML_SETTINGS";
export const updateSamlSettings = createThunkAction(
  UPDATE_SAML_SETTINGS,
  function (settings) {
    return async function (dispatch) {
      const result = await SamlApi.updateSettings(settings);
      await dispatch(reloadSettings());
      return result;
    };
  },
);

export const UPDATE_GOOGLE_SETTINGS =
  "metabase/admin/settings/UPDATE_GOOGLE_SETTINGS";
export const updateGoogleSettings = createThunkAction(
  UPDATE_GOOGLE_SETTINGS,
  function (settings) {
    return async function (dispatch) {
      const result = await GoogleApi.updateSettings(settings);
      await dispatch(reloadSettings());
      return result;
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
