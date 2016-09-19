import { createThunkAction, AngularResourceProxy } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";

import _ from "underscore";

const SessionApi = new AngularResourceProxy("Session", ["properties"]);

export const refreshSiteSettings = createThunkAction("REFRESH_SITE_SETTINGS", () =>
    async (dispatch, getState) => {
        const settings = _.omit(await SessionApi.properties(), (value, key) => key.indexOf('$') === 0);
        MetabaseSettings.setAll(settings);
        return settings;
    }
);
