
import { handleActions, combineReducers, createThunkAction } from "metabase/lib/redux";

import { SettingsApi, EmailApi, SlackApi, CardCacheApi } from "metabase/services";

import { refreshSiteSettings } from "metabase/redux/settings";

async function loadSettings() {
    try {
        let settings = await SettingsApi.list();
        return settings.map(function(setting) {
            setting.originalValue = setting.value;
            return setting;
        });
    } catch(error) {
        console.log("error fetching settings", error);
        throw error;
    }
}

// initializeSettings
export const initializeSettings = createThunkAction("INITIALIZE_SETTINGS", function() {
    return async function(dispatch, getState) {
        try {
            return await loadSettings();
        } catch(error) {
            console.log("error fetching settings", error);
            throw error;
        }
    };
});

// updateSetting
export const updateSetting = createThunkAction("UPDATE_SETTING", function(setting) {
    return async function(dispatch, getState) {
        try {
            await SettingsApi.put(setting);
            await dispatch(refreshSiteSettings());
            return await loadSettings();
        } catch(error) {
            console.log("error updating setting", setting, error);
            throw error;
        }
    };
});

// updateEmailSettings
export const updateEmailSettings = createThunkAction("UPDATE_EMAIL_SETTINGS", function(settings) {
    return async function(dispatch, getState) {
        try {
            await EmailApi.updateSettings(settings);
            await dispatch(refreshSiteSettings());
            return await loadSettings();
        } catch(error) {
            console.log("error updating email settings", settings, error);
            throw error;
        }
    };
});

// sendTestEmail
export const sendTestEmail = createThunkAction("SEND_TEST_EMAIL", function() {
    return async function(dispatch, getState) {
        try {
            await EmailApi.sendTest();
        } catch(error) {
            console.log("error sending test email", error);
            throw error;
        }
    };
});

// updateSlackSettings
export const updateSlackSettings = createThunkAction("UPDATE_SLACK_SETTINGS", function(settings) {
    return async function(dispatch, getState) {
        try {
            await SlackApi.updateSettings(settings);
            await dispatch(refreshSiteSettings());
            return await loadSettings();
        } catch(error) {
            console.log("error updating slack settings", settings, error);
            throw error;
        }
    };
});

// updateCacheSettings
export const updateCacheSettings = createThunkAction("UPDATE_CACHE_SETTINGS", function(settings) {
    return async function(dispatch, getState) {
        try {
            await CardCacheApi.updateSettings(settings);
            await dispatch(refreshSiteSettings());
            return await loadSettings();
        } catch(error) {
            console.log("error updating slack settings", settings, error);
            throw error;
        }
    };
});

export const reloadSettings = createThunkAction("RELOAD_SETTINGS", function() {
    return async function(dispatch, getState) {
        await dispatch(refreshSiteSettings());
        return await loadSettings();
    }
});

// reducers

const settings = handleActions({
    ["INITIALIZE_SETTINGS"]: { next: (state, { payload }) => payload },
    ["UPDATE_SETTING"]: { next: (state, { payload }) => payload },
    ["UPDATE_EMAIL_SETTINGS"]: { next: (state, { payload }) => payload },
    ["UPDATE_SLACK_SETTINGS"]: { next: (state, { payload }) => payload },
    ["UPDATE_CACHE_SETTINGS"]: { next: (state, { payload }) => payload },
    ["RELOAD_SETTINGS"]: { next: (state, { payload }) => payload }
}, []);

export default combineReducers({
    settings
});
