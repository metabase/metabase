
import { createSelector } from 'reselect';

const databaseId               = state => state.databaseId;
const showAddFieldPicker       = state => state.showAddFieldPicker;
const virtualTable             = state => state.virtualTable;
const metadata                 = state => state.metadata;
const previewData              = state => state.previewData;

export const selectors = createSelector(
    databaseId,
    showAddFieldPicker,
    virtualTable,
    metadata,
    previewData,
    (databaseId, showAddFieldPicker, virtualTable, metadata, previewData) => ({databaseId, showAddFieldPicker, virtualTable, metadata, previewData})
);
