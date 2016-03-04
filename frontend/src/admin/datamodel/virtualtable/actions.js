
import { createAction } from "redux-actions";
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


// fetch tables for the database, filtered by schema if appropriate
export const FETCH_TABLES = "FETCH_TABLES";
export const fetchTables = createAction(FETCH_TABLES, async (databaseId, schema) => {
    let tables = await Metabase.db_tables({dbId: databaseId});
    if (schema) {
        // TODO: filter results by schema
    }
    return tables;
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
            limit: 100
        }
    };

    // apply filters if they exist
    if (virtualTable.filters && virtualTable.filters.length > 0) {
        query.query.filter = virtualTable.filters;
    }

    return await Metabase.dataset(query);
});

// update the filters on the virtual table
export const SET_FILTERS = "SET_FILTERS";
export const setFilters = createThunkAction(SET_FILTERS, (filters) => {
    return (dispatch, getState) => {
        const { virtualTable } = getState();
        // TODO: check if this impacts our state through mutability :(
        virtualTable.filters = filters;
        dispatch(updatePreviewData(virtualTable));
        return filters;
    };
});

// update the name/description on the virtual table
export const SET_NAME_DESCRIPTION = "SET_NAME_DESCRIPTION";
export const setNameAndDescription = createAction(SET_NAME_DESCRIPTION, (name, description) => ({ name, description }));


// mark a field for inclusion/exclusion in the virtual table
export const INCLUDE_FIELD = "INCLUDE_FIELD";
export const EXCLUDE_FIELD = "EXCLUDE_FIELD";
export const includeField = createAction(INCLUDE_FIELD);
export const excludeField = createAction(EXCLUDE_FIELD);

