import { reloadSettings } from "metabase/admin/settings/settings";
import { createThunkAction } from "metabase/lib/redux";
import { SlackApi } from "metabase/services";
import type { SlackSettings } from "metabase-types/api/slack";

export const LOAD_MANIFEST = "metabase/admin/settings/slack/LOAD_MANIFEST";
export const loadManifest = createThunkAction(LOAD_MANIFEST, () => async () => {
  return await SlackApi.getManifest();
});

export const UPDATE_SETTINGS = "metabase/admin/settings/slack/UPDATE_SETTINGS";
export const updateSettings = createThunkAction(
  UPDATE_SETTINGS,
  (settings?: SlackSettings) => async (dispatch: any) => {
    await SlackApi.updateSettings(settings);
    await dispatch(reloadSettings());
  },
);
