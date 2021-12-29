import { createThunkAction } from "metabase/lib/redux";
import { updateSetting } from "metabase/admin/settings/settings";

export const HIDE_DATA = "metabase/home/homepage/HIDE_DATA";
export const hideData = createThunkAction(HIDE_DATA, function() {
  return async function(dispatch: any) {
    const setting = { key: "show-homepage-data", value: false };
    await dispatch(updateSetting(setting));
  };
});

export const HIDE_XRAYS = "metabase/home/homepage/HIDE_XRAYS";
export const hideXrays = createThunkAction(HIDE_XRAYS, function() {
  return async function(dispatch: any) {
    const setting = { key: "show-homepage-xrays", value: false };
    await dispatch(updateSetting(setting));
  };
});

export const HIDE_PIN_MESSAGE = "metabase/home/homepage/HIDE_PIN_MESSAGE";
export const hidePinMessage = createThunkAction(HIDE_PIN_MESSAGE, function() {
  return async function(dispatch: any) {
    const setting = { key: "show-homepage-pin-message", value: false };
    await dispatch(updateSetting(setting));
  };
});

export const HIDE_SYNCING_MODAL = "metabase/home/homepage/HIDE_SYNCING_MODAL";
export const hideSyncingModal = createThunkAction(
  HIDE_SYNCING_MODAL,
  function() {
    return async function(dispatch: any) {
      const setting = { key: "show-database-syncing-modal", value: false };
      await dispatch(updateSetting(setting));
    };
  },
);
