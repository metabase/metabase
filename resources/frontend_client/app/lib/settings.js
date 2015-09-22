'use strict';

import _ from "underscore";

const mb_settings = _.clone(window.MetabaseBootstrap);

// provides access to Metabase application settings
const MetabaseSettings = {
    hasSetupToken: function() {
        return mb_settings.setup_token !== undefined;
    },

    get: function(propName, defaultValue) {
        return mb_settings[propName] || defaultValue || null;
    },

    setAll: function(settings) {
        for (var attrname in settings) {
            mb_settings[attrname] = settings[attrname];
        }
    }
}

export default MetabaseSettings;
