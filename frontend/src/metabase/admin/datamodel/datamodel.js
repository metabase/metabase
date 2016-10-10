import _ from "underscore";

import { handleActions, combineReducers, AngularResourceProxy, createAction, createThunkAction, momentifyTimestamps } from "metabase/lib/redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { loadTableAndForeignKeys } from "metabase/lib/table";
import { isFK } from "metabase/lib/types";


// resource wrappers
const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "db_metadata", "db_idfields", "table_update", "field_update"]);
const SegmentApi = new AngularResourceProxy("Segment", ["delete"]);
const MetricApi = new AngularResourceProxy("Metric", ["delete"]);
const Segment = new AngularResourceProxy("Segment", ["get", "create", "update", "delete"]);
const Metric = new AngularResourceProxy("Metric", ["get", "create", "update", "delete"]);
const Metabase = new AngularResourceProxy("Metabase", ["dataset"]);
const Revisions = new AngularResourceProxy("Revisions", ["get"]);


function loadDatabaseMetadata(databaseId) {
    return MetabaseApi.db_metadata({ 'dbId': databaseId });
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
        try {
            let database = await loadDatabaseMetadata(db.id);

            dispatch(fetchDatabaseIdfields(db.id));

            // we also want to update our url to match our new state
            dispatch(push('/admin/datamodel/database/'+db.id));

            return database;
        } catch (error) {
            console.log("error fetching tables", db.id, error);
        }
    };
});

// selectTable
export const selectTable = createThunkAction("SELECT_TABLE", function(table) {
    return function(dispatch, getState) {
        // we also want to update our url to match our new state
        dispatch(push('/admin/datamodel/database/'+table.db_id+'/table/'+table.id));

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
        const { datamodel: { editingDatabase } } = getState();

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
    return function(dispatch, getState) {

        // If we are changing the field from a FK to something else, we should delete any FKs present
        if (field.target && field.target.id != null && isFK(field.special_type)) {
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
    return function(dispatch, getState) {
        // This function notes a change in the target of the target of a foreign key
        dispatch(updateField(field));

        MetabaseAnalytics.trackEvent("Data Model", "Update Field Target");
    };
});

// retireSegment
export const onRetireSegment = createThunkAction("RETIRE_SEGMENT", function(segment) {
    return async function(dispatch, getState) {
        const { datamodel: { editingDatabase } } = getState();

        await SegmentApi.delete(segment);
        MetabaseAnalytics.trackEvent("Data Model", "Retire Segment");

        return await loadDatabaseMetadata(editingDatabase.id);
    };
});

// retireMetric
export const onRetireMetric = createThunkAction("RETIRE_METRIC", function(metric) {
    return async function(dispatch, getState) {
        const { datamodel: { editingDatabase } } = getState();

        await MetricApi.delete(metric);
        MetabaseAnalytics.trackEvent("Data Model", "Retire Metric");

        return await loadDatabaseMetadata(editingDatabase.id);
    };
});


// SEGMENTS

export const GET_SEGMENT = "GET_SEGMENT";
export const CREATE_SEGMENT = "CREATE_SEGMENT";
export const UPDATE_SEGMENT = "UPDATE_SEGMENT";
export const DELETE_SEGMENT = "DELETE_SEGMENT";

export const getSegment    = createAction(GET_SEGMENT, Segment.get);
export const createSegment = createAction(CREATE_SEGMENT, Segment.create);
export const updateSegment = createAction(UPDATE_SEGMENT, Segment.update);
export const deleteSegment = createAction(DELETE_SEGMENT, Segment.delete);

// METRICS

export const GET_METRIC = "GET_METRIC";
export const CREATE_METRIC = "CREATE_METRIC";
export const UPDATE_METRIC = "UPDATE_METRIC";
export const DELETE_METRIC = "DELETE_METRIC";

export const getMetric    = createAction(GET_METRIC, Metric.get);
export const createMetric = createAction(CREATE_METRIC, Metric.create);
export const updateMetric = createAction(UPDATE_METRIC, Metric.update);
export const deleteMetric = createAction(DELETE_METRIC, Metric.delete);

// SEGMENT DETAIL

export const LOAD_TABLE_METADATA = "LOAD_TABLE_METADATA";
export const UPDATE_PREVIEW_SUMMARY = "UPDATE_PREVIEW_SUMMARY";

export const loadTableMetadata = createAction(LOAD_TABLE_METADATA, loadTableAndForeignKeys);
export const updatePreviewSummary = createAction(UPDATE_PREVIEW_SUMMARY, async (query) => {
    let result = await Metabase.dataset(query);
    return result.data.rows[0][0];
});

// REVISION HISTORY

export const FETCH_REVISIONS = "FETCH_REVISIONS";

export const fetchRevisions = createThunkAction(FETCH_REVISIONS, ({ entity, id }) =>
    async (dispatch, getState) => {
        let action;
        switch (entity) {
            case "segment": action = getSegment({ segmentId: id }); break;
            case "metric": action = getMetric({ metricId: id }); break;
        }
        let [object, revisions] = await Promise.all([
            dispatch(action),
            Revisions.get({ entity, id })
        ]);
        await dispatch(loadTableMetadata(object.payload.definition.source_table));
        return { object: object.payload, revisions };
    }
);


// reducers

const databases = handleActions({
    ["INITIALIZE_METADATA"]: { next: (state, { payload }) => payload.databases }
}, []);

const idfields = handleActions({
    ["FETCH_IDFIELDS"]: { next: (state, { payload }) => payload ? payload : state }
}, []);

const editingDatabase = handleActions({
    ["INITIALIZE_METADATA"]: { next: (state, { payload }) => payload.database },
    ["SELECT_DATABASE"]: { next: (state, { payload }) => payload ? payload : state },
    ["RETIRE_SEGMENT"]: { next: (state, { payload }) => payload },
    ["RETIRE_METRIC"]: { next: (state, { payload }) => payload }
}, null);

const editingTable = handleActions({
    ["INITIALIZE_METADATA"]: { next: (state, { payload }) => payload.tableId || null },
    ["SELECT_TABLE"]: { next: (state, { payload }) => payload }
}, null);

const segments = handleActions({
    [GET_SEGMENT]:    { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [CREATE_SEGMENT]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [UPDATE_SEGMENT]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [DELETE_SEGMENT]: { next: (state, { payload }) => { state = { ...state }; delete state[payload.id]; return state; }}
}, {});

const metrics = handleActions({
    [GET_METRIC]:    { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [CREATE_METRIC]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [UPDATE_METRIC]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [DELETE_METRIC]: { next: (state, { payload }) => { state = { ...state }; delete state[payload.id]; return state; }}
}, {});

const tableMetadata = handleActions({
    [LOAD_TABLE_METADATA]: {
        next: (state, { payload }) => (payload && payload.table) ? payload.table : null,
        throw: (state, action) => null
    }
}, null);

const previewSummary = handleActions({
    [UPDATE_PREVIEW_SUMMARY]: { next: (state, { payload }) => payload }
}, null);

const revisionObject = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload: revisionObject }) => revisionObject }
}, null);

export default combineReducers({
    databases,
    idfields,
    editingDatabase,
    editingTable,
    segments,
    metrics,
    tableMetadata,
    previewSummary,
    revisionObject
});
