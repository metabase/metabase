
import { createSelector } from 'reselect';

const databaseId               = state => state.databaseId;
const uiControls               = state => state.uiControls;
const showAddFieldPicker       = state => state.showAddFieldPicker;
const virtualTable             = state => state.virtualTable;
const metadata                 = state => state.metadata;
const previewData              = state => state.previewData;

export const selectors = createSelector(
    databaseId,
    uiControls,
    showAddFieldPicker,
    virtualTable,
    metadata,
    previewData,
    (databaseId, uiControls, showAddFieldPicker, virtualTable, metadata, previewData) => ({databaseId, uiControls, showAddFieldPicker, virtualTable, metadata, previewData})
);
