import { SlackApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";
import { SlackData } from "./types";
import { reloadSettings } from "metabase/admin/settings/settings";

export const UPDATE_SETTINGS = "metabase/admin/settings/slack/UPDATE_SETTINGS";
export const updateSettings = createThunkAction(
  UPDATE_SETTINGS,
  ({ token, channel }: SlackData = {}) => async (dispatch: any) => {
    const request = {
      "slack-app-token": token,
      "slack-files-channel": channel,
    };

    await SlackApi.updateSettings(request);
    await dispatch(reloadSettings());
  },
);
