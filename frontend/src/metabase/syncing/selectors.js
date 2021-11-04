import { createSelector } from "reselect";

export const REFRESH_INTERVAL = 5000;

export const getUserDatabases = createSelector(
  props => props.databases,
  databases => databases.filter(d => !d.is_sample),
);

export const getSyncingDatabases = createSelector(
  [getUserDatabases],
  databases => databases.filter(d => !d.initial_sync),
);

export const getRefreshInterval = createSelector(
  [getSyncingDatabases],
  databases => (databases.length > 0 ? REFRESH_INTERVAL : 0),
);
