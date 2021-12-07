import { createThunkAction } from "metabase/lib/redux";
import { updateSetting } from "metabase/admin/settings/settings";

export const HIDE_SYNCING_MODAL = "metabase/syncing/HIDE_SYNCING_MODAL";
export const hideSyncingModal = createThunkAction(HIDE_SYNCING_MODAL, () => {
  return async (dispatch: any) => {
    const setting = { key: "enable-database-syncing-modal", value: false };
    await dispatch(updateSetting(setting));
  };
});
