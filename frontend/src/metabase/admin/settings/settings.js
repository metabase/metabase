
import { createThunkAction } from "metabase/lib/redux";

import { SettingsApi, EmailApi, SlackApi } from "metabase/services";

import { refreshSiteSettings } from "metabase/redux/settings";

// initializeSettings
export const initializeSettings = createThunkAction("INITIALIZE_SETTINGS", function() {
    return async function(dispatch, getState) {
        try {
            await dispatch(refreshSiteSettings());
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
        } catch(error) {
            console.log("error updating slack settings", settings, error);
            throw error;
        }
    };
}, {});

export const reloadSettings = createThunkAction("RELOAD_SETTINGS", function() {
    return async function(dispatch, getState) {
        await dispatch(refreshSiteSettings());
    }
});
