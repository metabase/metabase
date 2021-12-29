import { createSelector } from "reselect";
import { createCandidatesQuery } from "./utils/database-candidates";

export const getCandidatesQuery = createSelector(
  (state: any, props: any) => props.databases,
  (state: any, props: any) => props.dashboards,
  (state: any) => getShowXrays(state),
  (state: any) => getEnableXrays(state),
  createCandidatesQuery,
);

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

export const getEnableXrays = createSelector(
  [getSettings],
  settings => settings["enable-xrays"],
);

export const getShowPinMessage = createSelector(
  [getSettings],
  settings => settings["show-homepage-pin-message"],
);

export const getShowSyncingModal = createSelector(
  [getSettings],
  settings => settings["show-database-syncing-modal"],
);
