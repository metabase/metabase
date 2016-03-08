
import { createAction } from "redux-actions";
import _ from "underscore";

import { AngularResourceProxy, createThunkAction } from "metabase/lib/redux";

import { loadTable } from "metabase/lib/table";

const Metabase = new AngularResourceProxy("Metabase", ["db_tables", "dataset"]);



// action for clicking the "Choose a table to start with" button which kicks off the whole VT creation process
export const START_NEW_TABLE = "START_NEW_TABLE";
export const startNewTable = createAction(START_NEW_TABLE);

// set the state of our "add field" workflow.  options are: null, picking, custom, join
export const UI_ADD_FIELD_CHOOSER = "UI_ADD_FIELD_CHOOSER";
export const uiAddFieldChooser = createAction(UI_ADD_FIELD_CHOOSER);
export const UI_CANCEL_EDITING = "UI_CANCEL_EDITING";
export const uiCancelEditing = createAction(UI_CANCEL_EDITING);
export const UI_EDIT_CUSTOM_FIELD = "UI_EDIT_CUSTOM_FIELD";
export const uiEditCustomField = createAction(UI_EDIT_CUSTOM_FIELD);
export const UI_EDIT_JOIN = "UI_EDIT_JOIN";
export const uiEditJoin = createAction(UI_EDIT_JOIN);
export const UI_PICK_JOIN_TABLE = "UI_PICK_JOIN_TABLE";
export const uiPickJoinTable = createThunkAction(UI_PICK_JOIN_TABLE, (table) => {
    return async (dispatch, getState) => {
        return await loadTable(table.id);
    };
});

// set the base table for a new virtual table
export const PICK_BASE_TABLE = "PICK_BASE_TABLE";
export const pickBaseTable = createThunkAction(PICK_BASE_TABLE, (table) => {
    return async (dispatch, getState) => {
        let tableMetadata = await loadTable(table.id);

        // dispatch a separate action which will update our preview data
        dispatch(updatePreviewData({database_id: table.db_id, table_id: table.id}));

        return tableMetadata;
    };
});

// update the name/description on the virtual table
export const SET_NAME_DESCRIPTION = "SET_NAME_DESCRIPTION";
export const setNameAndDescription = createAction(SET_NAME_DESCRIPTION, (name, description) => ({ display_name: name, description }));


// update the filters on the virtual table
export const SET_FILTERS = "SET_FILTERS";
export const setFilters = createThunkAction(SET_FILTERS, (filters) => {
    return (dispatch, getState) => {
        const { virtualTable } = getState();

        // clone and modify the current virtual table to kick of a proper refresh of preview data
        const previewTable = _.clone(virtualTable);
        previewTable.filters = filters;
        dispatch(updatePreviewData(previewTable));

        return filters;
    };
});

// mark a field for inclusion/exclusion in the virtual table
// TODO: update the preview data accordingly
export const INCLUDE_FIELD = "INCLUDE_FIELD";
export const EXCLUDE_FIELD = "EXCLUDE_FIELD";
export const includeField = createAction(INCLUDE_FIELD);
export const excludeField = createAction(EXCLUDE_FIELD);


// add/remove a custom field
// TODO: update the preview data accordingly
export const ADD_CUSTOM_FIELD = "ADD_CUSTOM_FIELD";
export const REMOVE_CUSTOM_FIELD = "REMOVE_CUSTOM_FIELD";
export const UPDATE_CUSTOM_FIELD = "UPDATE_CUSTOM_FIELD";
export const addCustomField = createAction(ADD_CUSTOM_FIELD, (customField) => {
    // new custom fields always start out visible
    customField.hash = Math.random().toString(36).substring(7);
    customField.source = "custom";
    customField.included = true;
    return customField;
});
export const updateCustomField = createAction(UPDATE_CUSTOM_FIELD);
export const removeCustomField = createAction(REMOVE_CUSTOM_FIELD);


// add/update/remove joins
export const ADD_JOIN = "ADD_JOIN";
export const REMOVE_JOIN = "REMOVE_JOIN";
export const UPDATE_JOIN = "UPDATE_JOIN";
export const addJoin = createThunkAction(ADD_JOIN, (join) => {
    return (dispatch, getState) => {
        const { metadata } = getState();
        join.hash = Math.random().toString(36).substring(7);
        let targetTable = metadata[join.target_table_id].table;
        return {
            join,
            targetTable
        };
    }
});
export const updateJoin = createAction(UPDATE_JOIN);
export const removeJoin = createAction(REMOVE_JOIN);


// fetch tables for the database, filtered by schema if appropriate
export const FETCH_TABLES = "FETCH_TABLES";
export const fetchTables = createAction(FETCH_TABLES, async (databaseId, schema) => {
    let tables = await Metabase.db_tables({dbId: databaseId});
    if (schema) {
        tables = tables.filter((table) => table.schema === schema);
    }
    return tables;
});

// update the data preview
export const UPDATE_PREVIEW_DATA = "UPDATE_PREVIEW_DATA";
export const updatePreviewData = createAction(UPDATE_PREVIEW_DATA, async (virtualTable) => {
    // all we want is a simple rows query with at most 100 rows of data to preview
    let query = {
        database: virtualTable.database_id,
        type: "query",
        query: {
            source_table: virtualTable.table_id,
            aggregation: ["rows"],
            limit: 10
        }
    };

    // apply filters if they exist
    if (virtualTable.filters && virtualTable.filters.length > 0) {
        query.query.filter = virtualTable.filters;
    }

    return await Metabase.dataset(query);
});

