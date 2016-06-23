
import { createAction } from "redux-actions";
import { handleActions, combineReducers, AngularResourceProxy, createThunkAction } from "metabase/lib/redux";


// resource wrappers
const SettingsApi = new AngularResourceProxy("Settings", ["list", "put"]);
const EmailApi = new AngularResourceProxy("Email", ["updateSettings"]);
const SlackApi = new AngularResourceProxy("Slack", ["updateSettings"]);


async function loadSettings() {
    try {
        let settings = await SettingsApi.list();
        return settings.map(function(setting) {
            setting.originalValue = setting.value;
            return setting;
        });
    } catch(error) {
        console.log("error fetching settings", error);
    }
}

// initializeSettings
export const initializeSettings = createThunkAction("INITIALIZE_SETTINGS", function() {
    return async function(dispatch, getState) {
        try {
            return await loadSettings();
        } catch(error) {
            console.log("error fetching settings", error);
        }
    };
});

// selectSection
export const selectSection = createAction("SELECT_SECTION");

// updateSetting
export const updateSetting = createThunkAction("UPDATE_SETTING", function(setting) {
    return async function(dispatch, getState) {
        const { refreshSiteSettings } = getState();

        try {
            await SettingsApi.put({ key: setting.key }, setting);
            refreshSiteSettings();
            return await loadSettings();
        } catch(error) {
            console.log("error updating setting", setting, error);
        }
    };
});

// updateEmailSettings
export const updateEmailSettings = createThunkAction("UPDATE_EMAIL_SETTINGS", function(settings) {
    return async function(dispatch, getState) {
        const { refreshSiteSettings } = getState();

        try {
            await EmailApi.updateSettings(settings);
            refreshSiteSettings();
            return await loadSettings();
        } catch(error) {
            console.log("error updating email settings", settings, error);
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
        }
    };
});

// updateSlackSettings
export const updateSlackSettings = createThunkAction("UPDATE_SLACK_SETTINGS", function(settings) {
    return async function(dispatch, getState) {
        const { refreshSiteSettings } = getState();

        try {
            await SlackApi.updateSettings(settings);
            refreshSiteSettings();
            return await loadSettings();
        } catch(error) {
            console.log("error updating slack settings", settings, error);
        }
    };
});


// reducers

// this is a backwards compatibility thing with angular to allow programmatic route changes.  remove/change this when going to ReduxRouter
const refreshSiteSettings = handleActions({}, () => null);

const settings = handleActions({
    ["INITIALIZE_SETTINGS"]: { next: (state, { payload }) => payload },
    ["UPDATE_SETTING"]: { next: (state, { payload }) => payload },
    ["UPDATE_EMAIL_SETTINGS"]: { next: (state, { payload }) => payload },
    ["UPDATE_SLACK_SETTINGS"]: { next: (state, { payload }) => payload }
}, []);

const activeSection = handleActions({
    ["SELECT_SECTION"]: { next: (state, { payload }) => payload }
}, "Setup");

export default combineReducers({
    settings,
    activeSection,
    refreshSiteSettings
});
