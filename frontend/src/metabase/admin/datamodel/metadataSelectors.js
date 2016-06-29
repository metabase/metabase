
import { createSelector } from 'reselect';
import { computeMetadataStrength } from "metabase/lib/schema_metadata";


export const getDatabases             = state => state.databases;
export const getDatabaseIdfields      = state => state.idfields;
export const getEditingTable          = state => state.editingTable;


export const getEditingDatabaseWithTableMetadataStrengths = createSelector(
    state => state.editingDatabase,
    (database) => {
        if (!database || !database.tables) {
            return null;
        }

        database.tables =  database.tables.map((table) => {
            table.metadataStrength = computeMetadataStrength(table);
            return table;
        });

        return database;
    }
);
