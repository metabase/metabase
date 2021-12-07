import { createSelector } from "reselect";
import { isSyncInProgress } from "metabase/lib/syncing";
import { getMetadata } from "metabase/selectors/metadata";
import { getUserId } from "metabase/selectors/user";

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
  [hasSyncingDatabases],
  hasSyncingDatabases => (hasSyncingDatabases ? RELOAD_INTERVAL : 0),
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
