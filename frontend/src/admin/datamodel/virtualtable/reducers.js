import { handleActions } from "redux-actions";
import _ from "underscore";

import {
    START_NEW_TABLE,
    PICK_BASE_TABLE,
    SHOW_ADD_FIELD_PICKER,
    UI_PICK_JOIN_TABLE,

    SET_NAME_DESCRIPTION,
    SET_FILTERS,
    INCLUDE_FIELD,
    EXCLUDE_FIELD,
    INCLUDE_CUSTOM_FIELD,
    EXCLUDE_CUSTOM_FIELD,
    ADD_CUSTOM_FIELD,
    REMOVE_CUSTOM_FIELD,

    FETCH_TABLES,
    UPDATE_TABLE_METADATA,
    UPDATE_PREVIEW_DATA,
} from "./actions";


export const databaseId = handleActions({}, null);

export const uiControls = handleActions({
    [SHOW_ADD_FIELD_PICKER]: { next: (state, { payload }) => ({ ...state, showAddFieldPicker: payload, joinTable: null }) },
    [UI_PICK_JOIN_TABLE]: { next: (state, { payload }) => ({ ...state, joinTable: payload }) }
}, {});


export const virtualTable = handleActions({
    [START_NEW_TABLE]: { next: (state, { payload }) => ({ name: "", description: "", fields: [], custom: [], join: [], filter: [] })},
    [PICK_BASE_TABLE]: { next: (state, { payload }) => ({ ...state, database_id: payload.db_id, table_id: payload.id })},

    // set any filters or name/description
    [SET_NAME_DESCRIPTION]: { next: (state, { payload }) => ({ ...state, ...payload })},
    [SET_FILTERS]: { next: (state, { payload }) => ({ ...state, filter: payload })},

    // include/exclude a field as visible in the table
    [UPDATE_TABLE_METADATA]: { next: (state, { payload }) => ({ ...state, fields: payload.table.fields.map((f) => f.id) })},
    [INCLUDE_FIELD]: { next: (state, { payload }) => ({ ...state, fields: [...state.fields, payload] })},
    [EXCLUDE_FIELD]: { next: (state, { payload }) => ({ ...state, fields: state.fields.filter((fieldId) => fieldId !== payload) })},
    [INCLUDE_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, custom: state.custom.map((field) => {
        return (payload == field) ? { ...payload, isVisible: true } : field;
    })})},
    [EXCLUDE_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, custom: state.custom.map((field) => {
        return (payload == field) ? { ...payload, isVisible: false } : field;
    })})},

    // add/remove a custom field definition
    [ADD_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, custom: [...state.custom, payload] })},
    [REMOVE_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, custom: state.custom.filter((field, index) => index !== payload)})},
}, null);

export const metadata = handleActions({
    [FETCH_TABLES]: { next: (state, { payload }) => ({ ...state, tables: payload })},
    [UPDATE_TABLE_METADATA]: { next: (state, { payload }) => ({ ...state, tableMetadata: payload })}
}, {});

export const previewData = handleActions({
    [UPDATE_PREVIEW_DATA]: { next: (state, { payload }) => (payload)}
}, null);
