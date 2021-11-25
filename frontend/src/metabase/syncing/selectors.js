import { createSelector } from "reselect";

export const RELOAD_INTERVAL = 2000;

export const getAllDatabases = createSelector(
  state => state.entities.databases,
  databases => Object.values(databases),
);

export const getSampleDatabase = createSelector([getAllDatabases], databases =>
  databases.find(d => d.is_sample),
);

export const getUserDatabases = createSelector([getAllDatabases], databases =>
  databases.filter(d => !d.is_sample && d.tables != null),
);

export const getSyncingDatabases = createSelector(
  [getUserDatabases],
  databases => databases.filter(d => !d.initial_sync),
);

export const hasSyncingDatabases = createSelector(
  [getSyncingDatabases],
  databases => databases.length > 0,
);

export const getReloadInterval = createSelector(
  [getSyncingDatabases],
  databases => (databases.length > 0 ? RELOAD_INTERVAL : 0),
);

export const getSettings = createSelector(
  state => state.settings,
  settings => settings.values,
);

export const xraysEnabled = createSelector(
  [getSettings],
  settings => settings["enable-xrays"],
);

export const isSyncingModalEnabled = createSelector(
  [getSettings],
  settings => settings["enable-database-syncing-modal"],
);

export const isSyncingModalRequired = createSelector(
  [hasSyncingDatabases, isSyncingModalEnabled],
  (isSyncing, isSyncingModalEnabled) => isSyncing && isSyncingModalEnabled,
);
