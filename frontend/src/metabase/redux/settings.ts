import MetabaseSettings from "metabase/lib/settings";
import {
  handleActions,
  createThunkAction,
  combineReducers,
} from "metabase/lib/redux";

import { SessionApi } from "metabase/services";
import { Dispatch, GetState } from "metabase-types/store";

export const REFRESH_SITE_SETTINGS = "metabase/settings/REFRESH_SITE_SETTINGS";

export const refreshSiteSettings = createThunkAction(
  REFRESH_SITE_SETTINGS,
  ({ locale }: { locale?: string } = {}) =>
    async (dispatch: Dispatch, getState: GetState) => {
      const settings = await SessionApi.properties(null, {
        headers: locale ? { "X-Metabase-Locale": locale } : {},
      });
      MetabaseSettings.setAll(settings);
      return settings;
    },
);

const values = handleActions(
  {
    [REFRESH_SITE_SETTINGS]: {
      next: (state, { payload }) => ({ ...state, ...payload }),
    },
  },
  // seed with setting values from MetabaseBootstrap
  window.MetabaseBootstrap,
);

export const settings = combineReducers({
  values,
});
