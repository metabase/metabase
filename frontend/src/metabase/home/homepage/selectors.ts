import { createSelector } from "reselect";

export const getSettings = createSelector<any, any, any>(
  state => state.settings,
  settings => settings.values,
);

export const getShowData = createSelector(
  [getSettings],
  settings => settings["show-homepage-data"],
);

export const getShowXrays = createSelector(
  [getSettings],
  settings => settings["show-homepage-xrays"],
);

export const getShowPinMessage = createSelector(
  [getSettings],
  settings => settings["show-homepage-pin-message"],
);

export const getShowSyncingModal = createSelector(
  [getSettings],
  settings => settings["show-database-syncing-modal"],
);
