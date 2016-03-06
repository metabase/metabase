
import { createSelector } from 'reselect';

const databaseId               = state => state.databaseId;
const uiControls               = state => state.uiControls;
const virtualTable             = state => state.virtualTable;
const metadata                 = state => state.metadata;
const previewData              = state => state.previewData;

export const selectors = createSelector(
    databaseId,
    uiControls,
    virtualTable,
    metadata,
    previewData,
    (databaseId, uiControls, virtualTable, metadata, previewData) => ({databaseId, uiControls, virtualTable, metadata, previewData})
);
