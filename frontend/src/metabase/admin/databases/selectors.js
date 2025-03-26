// Database List
<<<<<<< HEAD
export const getDeletes = (state) => state.admin.databases.deletes;
export const getDeletionError = (state) => state.admin.databases.deletionError;

export const getIsAddingSampleDatabase = (state) =>
  state.admin.databases.sampleDatabase.loading;
export const getAddSampleDatabaseError = (state) =>
  state.admin.databases.sampleDatabase.error;

export const getInitializeError = (state) =>
  state.admin.databases.initializeError;

// Deprecation notice

export const isDeprecationNoticeEnabled = (state) =>
  state.admin.databases.isDeprecationNoticeEnabled;
=======
export const getDeletes = state => state.admin.databases.deletes;
export const getDeletionError = state => state.admin.databases.deletionError;
>>>>>>> 6793cbb6dfb (port adding sample database to rtkquery)
