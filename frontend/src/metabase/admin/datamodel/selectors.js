import { createSelector } from "reselect";
import { computeMetadataStrength } from "metabase/lib/schema_metadata";

export const tableMetadataSelector = (state, props) =>
  state.admin.datamodel.tableMetadata;
const revisionObjectSelector = (state, props) =>
  state.admin.datamodel.revisionObject;

const userSelector = (state, props) => state.currentUser;

export const revisionHistorySelectors = createSelector(
  revisionObjectSelector,
  tableMetadataSelector,
  userSelector,
  (revisionObject, tableMetadata, user) => ({
    ...revisionObject,
    tableMetadata,
    user,
  }),
);

export const getDatabases = (state, props) => state.admin.datamodel.databases;
export const getDatabaseIdfields = (state, props) =>
  state.admin.datamodel.idfields;
export const getEditingTable = (state, props) =>
  state.admin.datamodel.editingTable;
export const getEditingDatabase = (state, props) =>
  state.admin.datamodel.editingDatabase;

export const getEditingDatabaseWithTableMetadataStrengths = createSelector(
  state => state.admin.datamodel.editingDatabase,
  database => {
    if (!database || !database.tables) {
      return null;
    }

    database.tables = database.tables.map(table => {
      table.metadataStrength = computeMetadataStrength(table);
      return table;
    });

    return database;
  },
);
