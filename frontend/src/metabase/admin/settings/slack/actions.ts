import { SlackApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";
import { reloadSettings } from "metabase/admin/settings/settings";
import { SlackSettings } from "metabase-types/api/slack";

export const UPDATE_SETTINGS = "metabase/admin/settings/slack/UPDATE_SETTINGS";
export const updateSettings = createThunkAction(
  UPDATE_SETTINGS,
  (settings?: SlackSettings) => async (dispatch: any) => {
    await SlackApi.updateSettings(settings);
    await dispatch(reloadSettings());
  },
);
