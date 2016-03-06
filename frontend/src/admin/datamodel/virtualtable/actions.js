
import { createAction } from "redux-actions";
import _ from "underscore";

import { AngularResourceProxy, createThunkAction } from "metabase/lib/redux";

import { loadTable } from "metabase/lib/table";

const Metabase = new AngularResourceProxy("Metabase", ["db_tables", "dataset"]);
const Revisions = new AngularResourceProxy("Revisions", ["get"]);



// action for clicking the "Choose a table to start with" button which kicks off the whole VT creation process
export const START_NEW_TABLE = "START_NEW_TABLE";
export const startNewTable = createAction(START_NEW_TABLE);

// set the state of our "add field" workflow.  options are: null, picking, custom, join
export const SHOW_ADD_FIELD_PICKER = "SHOW_ADD_FIELD_PICKER";
export const setShowAddFieldPicker = createAction(SHOW_ADD_FIELD_PICKER);
export const UI_PICK_JOIN_TABLE = "UI_PICK_JOIN_TABLE";
export const uiPickJoinTable = createThunkAction(UI_PICK_JOIN_TABLE, (table) => {
    return (dispatch, getState) => {
        dispatch(setShowAddFieldPicker("joinCondition"));
        return table;
    }
});

// set the base table for a new virtual table
export const PICK_BASE_TABLE = "PICK_BASE_TABLE";
export const pickBaseTable = createThunkAction(PICK_BASE_TABLE, (table) => {
    return (dispatch, getState) => {
        dispatch(updateTableMetadata(table));
        dispatch(updatePreviewData({database_id: table.db_id, table_id: table.id}));
        return table;
    };
});

// update the name/description on the virtual table
export const SET_NAME_DESCRIPTION = "SET_NAME_DESCRIPTION";
export const setNameAndDescription = createAction(SET_NAME_DESCRIPTION, (name, description) => ({ name, description }));


// update the filters on the virtual table
export const SET_FILTERS = "SET_FILTERS";
export const setFilters = createThunkAction(SET_FILTERS, (filters) => {
    return (dispatch, getState) => {
        const { virtualTable } = getState();

        // clone and modify the current virtual table to kick of a proper refresh of preview data
        const previewTable = _.cloneDeep(virtualTable);
        previewTable.filter = filters;
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
export const INCLUDE_CUSTOM_FIELD = "INCLUDE_CUSTOM_FIELD";
export const EXCLUDE_CUSTOM_FIELD = "EXCLUDE_CUSTOM_FIELD";
export const includeCustomField = createAction(INCLUDE_CUSTOM_FIELD, (field) => {
    console.log("include custom field");
    return field;
});
export const excludeCustomField = createAction(EXCLUDE_CUSTOM_FIELD, (field) => {
    console.log("exclude custom field");
    return field;
});


// add/remove a custom field
// TODO: update the preview data accordingly
export const ADD_CUSTOM_FIELD = "ADD_CUSTOM_FIELD";
export const REMOVE_CUSTOM_FIELD = "REMOVE_CUSTOM_FIELD";
export const addCustomField = createAction(ADD_CUSTOM_FIELD, (customField) => {
    // new custom fields always start out visible
    customField.hash = Math.random().toString(36).substring(7);
    customField.isVisible = true;
    return customField;
});
export const removeCustomField = createAction(REMOVE_CUSTOM_FIELD);



// fetch tables for the database, filtered by schema if appropriate
export const FETCH_TABLES = "FETCH_TABLES";
export const fetchTables = createAction(FETCH_TABLES, async (databaseId, schema) => {
    let tables = await Metabase.db_tables({dbId: databaseId});
    if (schema) {
        // TODO: filter results by schema
    }
    return tables;
});

// update the table metadata
export const UPDATE_TABLE_METADATA = "UPDATE_TABLE_METADATA";
export const updateTableMetadata = createAction(UPDATE_TABLE_METADATA, async (table) => {
    return await loadTable(table.id);
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
    if (virtualTable.filter && virtualTable.filter.length > 0) {
        query.query.filter = virtualTable.filter;
    }

    return await Metabase.dataset(query);
});

