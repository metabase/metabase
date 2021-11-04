import { createSelector } from "reselect";

export const REFRESH_INTERVAL = 5000;

export const getAllDatabases = createSelector(
  state => state.entities.databases,
  databases => Object.values(databases),
);

export const getUserDatabases = createSelector(
  [getAllDatabases],
  databases => databases.filter(d => !d.is_sample && d.tables != null),
);

export const getSyncingDatabases = createSelector(
  [getUserDatabases],
  databases => databases.filter(d => !d.initial_sync),
);

export const getRefreshInterval = createSelector(
  [getSyncingDatabases],
  databases => (databases.length > 0 ? REFRESH_INTERVAL : 0),
);
