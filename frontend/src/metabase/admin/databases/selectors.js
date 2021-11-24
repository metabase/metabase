import { createSelector } from "reselect";
import { isDeprecatedEngine } from "metabase/lib/engine";

// Database Edit
export const getEditingDatabase = state =>
  state.admin.databases.editingDatabase;
export const getDatabaseCreationStep = state =>
  state.admin.databases.databaseCreationStep;

// Database List
export const getDeletes = state => state.admin.databases.deletes;
export const getDeletionError = state => state.admin.databases.deletionError;

export const getIsAddingSampleDataset = state =>
  state.admin.databases.sampleDataset.loading;
export const getAddSampleDatasetError = state =>
  state.admin.databases.sampleDataset.error;

export const getInitializeError = state =>
  state.admin.databases.initializeError;

// Database Banner

export const getDatabases = createSelector(
  state => state.entities.databases,
  databases => Object.values(databases),
);

export const getDeprecatedDatabase = createSelector(
  [getDatabases],
  databases => databases.find(d => d.id && isDeprecatedEngine(d.engine)),
);

export const getSettings = createSelector(
  state => state.settings,
  settings => settings.values,
);

export const isDeprecationBannerEnabled = createSelector(
  [getSettings],
  settings => settings["engine-deprecation-notice-enabled"],
);
