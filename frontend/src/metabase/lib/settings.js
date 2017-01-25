import _ from "underscore";
import inflection from 'inflection';
import MetabaseUtils from "metabase/lib/utils";

const mb_settings = _.clone(window.MetabaseBootstrap);

const settingListeners = {};

// provides access to Metabase application settings
const MetabaseSettings = {

    get: function(propName, defaultValue = null) {
        return mb_settings[propName] !== undefined ? mb_settings[propName] : defaultValue;
    },

    set: function(key, value) {
        if (mb_settings[key] !== value) {
            mb_settings[key] = value;
            if (settingListeners[key]) {
                for (const listener of settingListeners[key]) {
                    setTimeout(() => listener(value));
                }
            }
        }
    },

    setAll: function(settings) {
        for (const key in settings) {
            MetabaseSettings.set(key, settings[key]);
        }
    },

    // these are all special accessors which provide a lookup of a property plus some additional help
    adminEmail: function() {
        return mb_settings.admin_email;
    },

    isEmailConfigured: function() {
        return mb_settings.email_configured;
    },

    isTrackingEnabled: function() {
        return mb_settings.anon_tracking_enabled || false;
    },

    hasSetupToken: function() {
        return (mb_settings.setup_token !== undefined && mb_settings.setup_token !== null);
    },

    ssoEnabled: function() {
        return mb_settings.google_auth_client_id != null;
    },

    newVersionAvailable: function(settings) {
        let versionInfo = _.findWhere(settings, {key: "version-info"}),
            currentVersion = MetabaseSettings.get("version").tag;

        if (versionInfo) versionInfo = versionInfo.value;

        return (versionInfo && MetabaseUtils.compareVersions(currentVersion, versionInfo.latest.version) < 0);
    },

    passwordComplexity: function(capitalize) {
        const complexity = this.get('password_complexity');

        const clauseDescription = function(clause) {
            switch (clause) {
                case "lower": return "lower case letter";
                case "upper": return "upper case letter";
                case "digit": return "number";
                case "special": return "special character";
            }
        };

        let description = (capitalize === false) ? "must be "+complexity.total+" characters long" : "Must be "+complexity.total+" characters long",
            clauses = [];

        ["lower", "upper", "digit", "special"].forEach(function(clause) {
            if (clause in complexity) {
                let desc = (complexity[clause] > 1) ? inflection.pluralize(clauseDescription(clause)) : clauseDescription(clause);
                clauses.push(MetabaseUtils.numberToWord(complexity[clause])+" "+desc);
            }
        });

        if (clauses.length > 0) {
            return description+" and include "+clauses.join(", ");
        } else {
            return description;
        }
    },

    on: function(setting, callback) {
        settingListeners[setting] = settingListeners[setting] || [];
        settingListeners[setting].push(callback);
    }
}

export default MetabaseSettings;
