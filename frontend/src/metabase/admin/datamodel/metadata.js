import _ from "underscore";

import { handleActions, combineReducers, AngularResourceProxy, createThunkAction } from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { augmentTable } from "metabase/lib/table";


// resource wrappers
const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "db_metadata", "db_idfields", "table_update", "field_update"]);
const SegmentApi = new AngularResourceProxy("Segment", ["delete"]);
const MetricApi = new AngularResourceProxy("Metric", ["delete"]);


async function loadDatabaseMetadata(databaseId) {
    let databaseMetadata = await MetabaseApi.db_metadata({ 'dbId': databaseId });

    databaseMetadata.tables = await Promise.all(databaseMetadata.tables.map(async (table) => {
        table = await augmentTable(table);
        return table;
    }));

    return databaseMetadata;
}

// initializeMetadata
export const initializeMetadata = createThunkAction("INITIALIZE_METADATA", function(databaseId, tableId) {
    return async function(dispatch, getState) {
        let databases, database;
        try {
            databases = await MetabaseApi.db_list();
        } catch(error) {
            console.log("error fetching databases", error);
        }

        // initialize a database
        if (databases && !_.isEmpty(databases)) {
            let db = databaseId ? _.findWhere(databases, {id: databaseId}) : databases[0];

            database = await loadDatabaseMetadata(db.id);
        }

        if (database) {
            dispatch(fetchDatabaseIdfields(database.id));
        }

        return {
            databases,
            database,
            tableId
        }
    };
});

// fetchDatabaseIdfields
export const fetchDatabaseIdfields = createThunkAction("FETCH_IDFIELDS", function(databaseId) {
    return async function(dispatch, getState) {
        try {
            let idfields = await MetabaseApi.db_idfields({ 'dbId': databaseId });
            return idfields.map(function(field) {
                field.displayName = field.table.display_name + " → " + field.display_name;
                return field;
            });
        } catch (error) {
            console.warn("error getting idfields", databaseId, error);
        }
    };
});

// selectDatabase
export const selectDatabase = createThunkAction("SELECT_DATABASE", function(db) {
    return async function(dispatch, getState) {
        const { onChangeLocation } = getState();

        try {
            let database = await loadDatabaseMetadata(db.id);

            dispatch(fetchDatabaseIdfields(db.id));

            // we also want to update our url to match our new state
            onChangeLocation('/admin/datamodel/database/'+db.id);

            return database;
        } catch (error) {
            console.log("error fetching tables", db.id, error);
        }
    };
});

// selectTable
export const selectTable = createThunkAction("SELECT_TABLE", function(table) {
    return async function(dispatch, getState) {
        const { onChangeLocation } = getState();

        // we also want to update our url to match our new state
        onChangeLocation('/admin/datamodel/database/'+table.db_id+'/table/'+table.id);

        return table.id;
    };
});

// updateTable
export const updateTable = createThunkAction("UPDATE_TABLE", function(table) {
    return async function(dispatch, getState) {
        try {
            // make sure we don't send all the computed metadata
            let slimTable = { ...table };
            slimTable = _.omit(slimTable, "fields", "fields_lookup", "aggregation_options", "breakout_options", "metrics", "segments");

            let updatedTable = await MetabaseApi.table_update(slimTable);
            _.each(updatedTable, (value, key) => { if (key.charAt(0) !== "$") { updatedTable[key] = value } });

            MetabaseAnalytics.trackEvent("Data Model", "Update Table");

            // TODO: we are not actually using this because the way the react components works actually mutates the original object :(
            return updatedTable;

        } catch (error) {
            console.log("error updating table", error);
            //MetabaseAnalytics.trackEvent("Databases", database.id ? "Update Failed" : "Create Failed", database.engine);
        }
    };
});

// updateField
export const updateField = createThunkAction("UPDATE_FIELD", function(field) {
    return async function(dispatch, getState) {
        const { editingDatabase } = getState();

        try {
            // make sure we don't send all the computed metadata
            let slimField = { ...field };
            slimField = _.omit(slimField, "operators_lookup", "valid_operators", "values");

            // update the field and strip out angular junk
            let updatedField = await MetabaseApi.field_update(slimField);
            _.each(updatedField, (value, key) => { if (key.charAt(0) !== "$") { updatedField[key] = value } });

            // refresh idfields
            let table = _.findWhere(editingDatabase.tables, {id: updatedField.table_id});
            dispatch(fetchDatabaseIdfields(table.db_id));

            MetabaseAnalytics.trackEvent("Data Model", "Update Field");

            // TODO: we are not actually using this because the way the react components works actually mutates the original object :(
            return updatedField;

        } catch (error) {
            console.log("error updating field", error);
            //MetabaseAnalytics.trackEvent("Databases", database.id ? "Update Failed" : "Create Failed", database.engine);
        }
    };
});

// updateFieldSpecialType
export const updateFieldSpecialType = createThunkAction("UPDATE_FIELD_SPECIAL_TYPE", function(field) {
    return async function(dispatch, getState) {

        // If we are changing the field from a FK to something else, we should delete any FKs present
        if (field.target && field.target.id != null && field.special_type !== "fk") {
            // we have something that used to be an FK and is now not an FK
            // clean up after ourselves
            field.target = null;
            field.fk_target_field_id = null;
        }

        // save the field
        dispatch(updateField(field));

        MetabaseAnalytics.trackEvent("Data Model", "Update Field Special-Type", field.special_type);
    };
});

// updateFieldTarget
export const updateFieldTarget = createThunkAction("UPDATE_FIELD_TARGET", function(field) {
    return async function(dispatch, getState) {
        // This function notes a change in the target of the target of a foreign key
        dispatch(updateField(field));

        MetabaseAnalytics.trackEvent("Data Model", "Update Field Target");
    };
});

// retireSegment
export const onRetireSegment = createThunkAction("RETIRE_SEGMENT", function(segment) {
    return async function(dispatch, getState) {
        const { editingDatabase } = getState();

        await SegmentApi.delete(segment);
        MetabaseAnalytics.trackEvent("Data Model", "Retire Segment");

        return await loadDatabaseMetadata(editingDatabase.id);
    };
});

// retireMetric
export const onRetireMetric = createThunkAction("RETIRE_METRIC", function(metric) {
    return async function(dispatch, getState) {
        const { editingDatabase } = getState();

        await MetricApi.delete(metric);
        MetabaseAnalytics.trackEvent("Data Model", "Retire Metric");
        
        return await loadDatabaseMetadata(editingDatabase.id);
    };
});


// reducers

// this is a backwards compatibility thing with angular to allow programmatic route changes.  remove/change this when going to ReduxRouter
const onChangeLocation = handleActions({}, () => null);

const databases = handleActions({
    ["INITIALIZE_METADATA"]: { next: (state, { payload }) => payload.databases }
}, []);

const idfields = handleActions({
    ["FETCH_IDFIELDS"]: { next: (state, { payload }) => payload }
}, []);

const editingDatabase = handleActions({
    ["INITIALIZE_METADATA"]: { next: (state, { payload }) => payload.database },
    ["SELECT_DATABASE"]: { next: (state, { payload }) => payload ? payload.database : state },
    ["RETIRE_SEGMENT"]: { next: (state, { payload }) => payload },
    ["RETIRE_METRIC"]: { next: (state, { payload }) => payload }
}, null);

const editingTable = handleActions({
    ["INITIALIZE_METADATA"]: { next: (state, { payload }) => payload.tableId || null },
    ["SELECT_TABLE"]: { next: (state, { payload }) => payload }
}, null);

export default combineReducers({
    databases,
    idfields,
    editingDatabase,
    editingTable,
    onChangeLocation
});
