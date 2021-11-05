import { createThunkAction } from "metabase/lib/redux";
import { SettingsApi } from "metabase/services";
import Settings from "metabase/lib/settings";

export const DISABLE_SYNCING_MODAL = "metabase/syncing/DISABLE_SYNCING_MODAL";

export const disableSyncingModal = createThunkAction(
  DISABLE_SYNCING_MODAL,
  () => {
    return async () => {
      Settings.set("enable-database-syncing-modal", false);

      await SettingsApi.put({
        key: "enable-database-syncing-modal",
        value: false,
      });
    };
  },
);
