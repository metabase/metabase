/* @flow weak */

// Database Edit
export const getEditingDatabase = state =>
  state.admin.databases.editingDatabase;
export const getFormState = state => state.admin.databases.formState;
export const getDatabaseCreationStep = state =>
  state.admin.databases.databaseCreationStep;

// Database List
export const getDeletes = state => state.admin.databases.deletes;
export const getDeletionError = state => state.admin.databases.deletionError;
