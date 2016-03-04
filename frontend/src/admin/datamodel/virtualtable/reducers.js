import { handleActions } from "redux-actions";

import {
    FETCH_TABLES,
    PICK_BASE_TABLE,
    START_NEW_TABLE,
    SHOW_ADD_FIELD_PICKER,
    UPDATE_TABLE_METADATA,
    UPDATE_PREVIEW_DATA,
    SET_FILTERS,
    SET_NAME_DESCRIPTION,
    INCLUDE_FIELD,
    EXCLUDE_FIELD
} from "./actions";


export const databaseId = handleActions({}, null);

export const showAddFieldPicker = handleActions({
    [SHOW_ADD_FIELD_PICKER]: { next: (state, { payload }) => (payload) }
}, null);

export const virtualTable = handleActions({
    [START_NEW_TABLE]: { next: (state, { payload }) => ({ name: "", description: "", fields: [], filters: [] })},
    [PICK_BASE_TABLE]: { next: (state, { payload }) => ({ ...state, database_id: payload.db_id, table_id: payload.id })},

    // set any filters or name/description
    [SET_FILTERS]: { next: (state, { payload }) => ({ ...state, filters: payload })},
    [SET_NAME_DESCRIPTION]: { next: (state, { payload }) => ({ ...state, ...payload })},

    // include/exclude a field
    [UPDATE_TABLE_METADATA]: { next: (state, { payload }) => ({ ...state, fields: payload.table.fields.map((f) => f.id) })},
    [INCLUDE_FIELD]: { next: (state, { payload }) => ({ ...state, fields: [...state.fields, payload] })},
    [EXCLUDE_FIELD]: { next: (state, { payload }) => ({ ...state, fields: state.fields.filter((fieldId) => fieldId !== payload) })}
}, null);

export const metadata = handleActions({
    [FETCH_TABLES]: { next: (state, { payload }) => ({ ...state, tables: payload })},
    [UPDATE_TABLE_METADATA]: { next: (state, { payload }) => ({ ...state, tableMetadata: payload })}
}, {});

export const previewData = handleActions({
    [UPDATE_PREVIEW_DATA]: { next: (state, { payload }) => (payload)}
}, null);