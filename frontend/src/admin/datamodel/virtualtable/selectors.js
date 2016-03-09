
import { createSelector } from 'reselect';

const database                 = state => state.database;
const schema                   = state => state.schema;
const uiControls               = state => state.uiControls;
const virtualTable             = state => state.virtualTable;
const tables                   = state => state.tables;
const metadata                 = state => state.metadata;
const previewData              = state => state.previewData;

export const selectors = createSelector(
    database,
    schema,
    uiControls,
    virtualTable,
    tables,
    metadata,
    previewData,
    (database, schema, uiControls, virtualTable, tables, metadata, previewData) => ({database, schema, uiControls, virtualTable, tables, metadata, previewData})
);
