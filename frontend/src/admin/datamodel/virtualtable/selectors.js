
import { createSelector } from 'reselect';

const databaseId               = state => state.databaseId;
const schema                   = state => state.schema;
const uiControls               = state => state.uiControls;
const virtualTable             = state => state.virtualTable;
const tables                   = state => state.tables;
const metadata                 = state => state.metadata;
const previewData              = state => state.previewData;

export const selectors = createSelector(
    databaseId,
    schema,
    uiControls,
    virtualTable,
    tables,
    metadata,
    previewData,
    (databaseId, schema, uiControls, virtualTable, tables, metadata, previewData) => ({databaseId, schema, uiControls, virtualTable, tables, metadata, previewData})
);
