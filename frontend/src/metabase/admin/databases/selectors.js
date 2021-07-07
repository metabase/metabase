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
