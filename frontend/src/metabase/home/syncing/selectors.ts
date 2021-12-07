import { createSelector } from "reselect";
import { getMetadata } from "metabase/selectors/metadata";

export const getDatabases = createSelector([getMetadata], metadata =>
  metadata.databasesList(),
);

export const getSettings = createSelector(
  (state: any) => state.settings,
  settings => settings.values,
);

export const showXrays = createSelector(
  [getSettings],
  settings => settings["enable-xrays"],
);

export const showModal = createSelector(
  [getSettings],
  settings => settings["enable-database-syncing-modal"],
);
