import { handleActions } from "redux-actions";
import _ from "underscore";

import {
    START_NEW_TABLE,
    PICK_BASE_TABLE,
    UI_ADD_FIELD_CHOOSER,
    UI_CANCEL_EDITING,
    UI_EDIT_CUSTOM_FIELD,
    UI_EDIT_JOIN,
    UI_PICK_JOIN_TABLE,

    SET_NAME_DESCRIPTION,
    SET_FILTERS,
    INCLUDE_FIELD,
    EXCLUDE_FIELD,
    ADD_CUSTOM_FIELD,
    UPDATE_CUSTOM_FIELD,
    REMOVE_CUSTOM_FIELD,
    ADD_JOIN,
    UPDATE_JOIN,
    REMOVE_JOIN,

    FETCH_TABLES,
    UPDATE_PREVIEW_DATA,
} from "./actions";


export const databaseId = handleActions({}, null);

export const uiControls = handleActions({
    [UI_ADD_FIELD_CHOOSER]: { next: (state, { payload }) => ({ ...state, editing: {} }) },
    [UI_CANCEL_EDITING]: { next: (state, { payload }) => ({ ...state, editing: null })},

    // custom field
    [UI_EDIT_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, editing: payload }) },
    [ADD_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, editing: null }) },
    [UPDATE_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, editing: null }) },
    [REMOVE_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, editing: null }) },

    // joins
    [UI_EDIT_JOIN]: { next: (state, { payload }) => ({ ...state, editing: payload })},
    [UI_PICK_JOIN_TABLE]: { next: (state, { payload }) => ({ ...state, editing: { ...state.editing, target_table_id: payload.table.id } }) },
    [ADD_JOIN]: { next: (state, { payload }) => ({ ...state, editing: null})},
    [UPDATE_JOIN]: { next: (state, { payload }) => ({ ...state, editing: null})},
    [REMOVE_JOIN]: { next: (state, { payload }) => ({ ...state, editing: null})},
}, {});


export const virtualTable = handleActions({
    [START_NEW_TABLE]: { next: (state, { payload }) => ({ name: "", description: "", fields: [], filters: [], joins: [] })},
    [PICK_BASE_TABLE]: { next: (state, { payload }) => ({ 
        ...state, 
        database_id: payload.table.db_id, 
        table_id: payload.table.id,
        fields: payload.table.fields.map((field) => ({
            field_id: field.id,
            display_name: field.display_name,
            source: "core",
            included: true
        }))
    })},

    // set name & description
    [SET_NAME_DESCRIPTION]: { next: (state, { payload }) => ({ ...state, ...payload })},

    // set any filters
    [SET_FILTERS]: { next: (state, { payload }) => ({ ...state, filters: payload })},

    // include/exclude a field as visible in the table
    [INCLUDE_FIELD]: { next: (state, { payload }) => ({ ...state, fields: state.fields.map((field) => {
        return (payload == field) ? { ...payload, included: true } : field;
    })})},
    [EXCLUDE_FIELD]: { next: (state, { payload }) => ({ ...state, fields: state.fields.map((field) => {
        return (payload == field) ? { ...payload, included: false } : field;
    })})},

    // add/update/remove a CUSTOM FIELD
    [ADD_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, fields: [...state.fields, payload] })},
    [UPDATE_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, fields: state.fields.map((field) => {
        return (field.source === "custom" && field.hash === payload.hash) ? payload : field;
    })})},
    [REMOVE_CUSTOM_FIELD]: { next: (state, { payload }) => ({ ...state, fields: state.fields.filter((field) => {
        return field.source !== "custom" || (field.source === "custom" && field.hash !== payload.hash)
    })})},

    // add/update/remove a JOIN
    [ADD_JOIN]: { next: (state, { payload }) => ({
        ...state,
        joins: [...state.joins, payload.join],
        fields: [...state.fields, ...payload.targetTable.fields.map((field) => ({
            field_id: field.id,
            display_name: field.display_name,
            source: "join",
            included: true
        }))]
    })},
    [UPDATE_JOIN]: { next: (state, { payload }) => ({ ...state, joins: state.joins.map((join) => {
        return (join.hash === payload.hash) ? payload : join;
    })})},
    [REMOVE_JOIN]: { next: (state, { payload }) => ({ ...state, joins: state.joins.filter((join) => join.hash !== payload.hash)})},
}, null);

export const tables = handleActions({
    [FETCH_TABLES]: { next: (state, { payload }) => payload },
}, null);

export const metadata = handleActions({
    [PICK_BASE_TABLE]: { next: (state, { payload }) => ({ ...state, [payload.table.id]: payload })},
    [UI_PICK_JOIN_TABLE]: { next: (state, { payload }) => ({ ...state, [payload.table.id]: payload })},
}, {});

export const previewData = handleActions({
    [UPDATE_PREVIEW_DATA]: { next: (state, { payload }) => (payload)}
}, null);
