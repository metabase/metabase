/* @flow */

// Reducers needed for admin section (only used in "main" app)

import people from "metabase/admin/people/people";
import databases from "metabase/admin/databases/database";
import datamodel from "metabase/admin/datamodel/datamodel";
import permissions from "metabase/admin/permissions/permissions";
import settings from "metabase/admin/settings/settings";

import { combineReducers, createThunkAction, handleActions } from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { UtilApi} from "metabase/services";
import { assoc } from "icepick";


export const LOAD_TROUBLESHOOTING_INFO = 'metabase/admin/LOAD_TROUBLESHOOTING_INFO';
export const getTroubleshootingInfo = createThunkAction(LOAD_TROUBLESHOOTING_INFO, function() {
    return async function(dispatch, getState) {
        const info = await UtilApi.troubleshooting_info();

        MetabaseAnalytics.trackEvent("Admin", "Troubleshooting Info");
        return info;
    };
});


const troubleshooting = handleActions({
    [LOAD_TROUBLESHOOTING_INFO]: { next: (state, { payload }) => payload }
}, null);

export default combineReducers({
    databases,
    datamodel,
    people,
    permissions,
    settings,
    troubleshooting
})
