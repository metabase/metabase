import _ from "underscore";
import inflection from 'inflection';
import MetabaseUtils from "metabase/lib/utils";

const mb_settings = _.clone(window.MetabaseBootstrap);


// provides access to Metabase application settings
const MetabaseSettings = {

    get: function(propName, defaultValue) {
        return mb_settings[propName] || defaultValue || null;
    },

    setAll: function(settings) {
        for (var attrname in settings) {
            mb_settings[attrname] = settings[attrname];
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

        return description;
    }
}

export default MetabaseSettings;
