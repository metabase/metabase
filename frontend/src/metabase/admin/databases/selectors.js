// Database Edit
export const getEditingDatabase = state =>
  state.admin.databases.editingDatabase;

// Database List
export const getDeletes = state => state.admin.databases.deletes;
export const getDeletionError = state => state.admin.databases.deletionError;

export const getIsAddingSampleDatabase = state =>
  state.admin.databases.sampleDatabase.loading;
export const getAddSampleDatabaseError = state =>
  state.admin.databases.sampleDatabase.error;

export const getInitializeError = state =>
  state.admin.databases.initializeError;

// Deprecation notice

export const isDeprecationNoticeEnabled = state =>
  state.admin.databases.isDeprecationNoticeEnabled;
