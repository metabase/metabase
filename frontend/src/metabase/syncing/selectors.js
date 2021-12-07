import { createSelector } from "reselect";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getUserId } from "metabase/selectors/user";
import { getMetadata } from "metabase/selectors/metadata";

export const RELOAD_INTERVAL = 2000;

export const getAllDatabases = createSelector([getMetadata], metadata =>
  metadata.databasesList(),
);

export const getSampleDatabase = createSelector([getAllDatabases], databases =>
  databases.find(d => d.is_sample),
);

export const getCustomDatabases = createSelector([getAllDatabases], databases =>
  databases.filter(d => !d.is_sample),
);

export const getUserDatabases = createSelector(
  [getCustomDatabases, getUserId],
  (databases, userId) => databases.filter(d => d.creator_id === userId),
);

export const getSyncingDatabases = createSelector(
  [getUserDatabases],
  databases => databases.filter(d => isSyncInProgress(d)),
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
