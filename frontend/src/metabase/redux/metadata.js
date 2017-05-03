import {
    handleActions,
    combineReducers,
    createAction,
    createThunkAction,
    resourceListToMap,
    fetchData,
    updateData,
} from "metabase/lib/redux";

import { normalize } from "normalizr";
import { DatabaseSchema, TableSchema, FieldSchema, SegmentSchema, MetricSchema } from "metabase/schema";

import { getIn, assocIn } from "icepick";
import _ from "underscore";

import { MetabaseApi, MetricApi, SegmentApi, RevisionsApi } from "metabase/services";

const FETCH_METRICS = "metabase/metadata/FETCH_METRICS";
export const fetchMetrics = createThunkAction(FETCH_METRICS, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "metrics"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const metrics = await MetricApi.list();
            return normalize(metrics, [MetricSchema]);
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

const UPDATE_METRIC = "metabase/metadata/UPDATE_METRIC";
export const updateMetric = createThunkAction(UPDATE_METRIC, function(metric) {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "metrics", metric.id];
        const existingStatePath = ["metadata", "metrics"];
        const dependentRequestStatePaths = [['metadata', 'revisions', 'metric', metric.id]];
        const putData = async () => {
            const updatedMetric = await MetricApi.update(metric);
            return normalize(updatedMetric, MetricSchema);
        };

        return await updateData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            dependentRequestStatePaths,
            putData
        });
    };
});

const UPDATE_METRIC_IMPORTANT_FIELDS = "metabase/guide/UPDATE_METRIC_IMPORTANT_FIELDS";
export const updateMetricImportantFields = createThunkAction(UPDATE_METRIC_IMPORTANT_FIELDS, function(metricId, importantFieldIds) {
    return async (dispatch, getState) => {
        const requestStatePath = ["reference", "guide", "metric_important_fields", metricId];
        const existingStatePath = requestStatePath;
        const dependentRequestStatePaths = [['reference', 'guide']];
        const putData = async () => {
            await MetricApi.update_important_fields({ metricId, important_field_ids: importantFieldIds });
        };

        return await updateData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            dependentRequestStatePaths,
            putData
        });
    };
});


const FETCH_SEGMENTS = "metabase/metadata/FETCH_SEGMENTS";
export const fetchSegments = createThunkAction(FETCH_SEGMENTS, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "segments"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const segments = await SegmentApi.list();
            return normalize(segments, [SegmentSchema]);
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

const UPDATE_SEGMENT = "metabase/metadata/UPDATE_SEGMENT";
export const updateSegment = createThunkAction(UPDATE_SEGMENT, function(segment) {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "segments", segment.id];
        const existingStatePath = ["metadata", "segments"];
        const dependentRequestStatePaths = [['metadata', 'revisions', 'segment', segment.id]];
        const putData = async () => {
            const updatedSegment = await SegmentApi.update(segment);
            return normalize(updatedSegment, SegmentSchema);
        };

        return await updateData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            dependentRequestStatePaths,
            putData
        });
    };
});

const FETCH_DATABASES = "metabase/metadata/FETCH_DATABASES";
export const fetchDatabases = createThunkAction(FETCH_DATABASES, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "databases"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const databases = await MetabaseApi.db_list_with_tables();
            return normalize(databases, [DatabaseSchema]);
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

const FETCH_DATABASE_METADATA = "metabase/metadata/FETCH_DATABASE_METADATA";
export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId, reload = false) {
    return async function(dispatch, getState) {
        const requestStatePath = ["metadata", "databases", dbId];
        const existingStatePath = ["metadata"];
        const getData = async () => {
            const databaseMetadata = await MetabaseApi.db_metadata({ dbId });
            return normalize(databaseMetadata, DatabaseSchema);
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

const UPDATE_DATABASE = "metabase/metadata/UPDATE_DATABASE";
export const updateDatabase = createThunkAction(UPDATE_DATABASE, function(database) {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "databases", database.id];
        const existingStatePath = ["metadata", "databases"];
        const putData = async () => {
            // make sure we don't send all the computed metadata
            // there may be more that I'm missing?
            const slimDatabase = _.omit(database, "tables", "tables_lookup");
            const updatedDatabase = await MetabaseApi.db_update(slimDatabase);
            return normalize(updatedDatabase, DatabaseSchema);
        };

        return await updateData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            putData
        });
    };
});

const UPDATE_TABLE = "metabase/metadata/UPDATE_TABLE";
export const updateTable = createThunkAction(UPDATE_TABLE, function(table) {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "tables", table.id];
        const existingStatePath = ["metadata", "tables"];
        const putData = async () => {
            // make sure we don't send all the computed metadata
            const slimTable = _.omit(table, "fields", "fields_lookup", "aggregation_options", "breakout_options", "metrics", "segments");

            const updatedTable = await MetabaseApi.table_update(slimTable);
            return normalize(updatedTable, TableSchema);
        };

        return await updateData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            putData
        });
    };
});

const FETCH_TABLES = "metabase/metadata/FETCH_TABLES";
export const fetchTables = createThunkAction(FETCH_TABLES, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "tables"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const tables = await MetabaseApi.table_list();
            return normalize(tables, [TableSchema]);
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

const FETCH_TABLE_METADATA = "metabase/metadata/FETCH_TABLE_METADATA";
export const fetchTableMetadata = createThunkAction(FETCH_TABLE_METADATA, function(tableId, reload = false) {
    return async function(dispatch, getState) {
        const requestStatePath = ["metadata", "tables", tableId];
        const existingStatePath = ["metadata"];
        const getData = async () => {
            const tableMetadata = await MetabaseApi.table_query_metadata({ tableId });
            const fkTableIds = _.chain(tableMetadata.fields).filter(field => field.target).map(field => field.target.table_id).uniq().value();
            const fkTables = await Promise.all(fkTableIds.map(tableId => MetabaseApi.table_query_metadata({ tableId })));
            return normalize([tableMetadata].concat(fkTables), [TableSchema]);
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

const FETCH_FIELD_VALUES = "metabase/metadata/FETCH_FIELD_VALUES";
export const fetchFieldValues = createThunkAction(FETCH_FIELD_VALUES, function(fieldId, reload) {
    return async function(dispatch, getState) {
        const requestStatePath = ["metadata", "fields", fieldId];
        const existingStatePath = requestStatePath;
        const getData = () => MetabaseApi.field_values({ fieldId })

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

export const ADD_PARAM_VALUES = "metabase/metadata/ADD_PARAM_VALUES";
export const addParamValues = createAction(ADD_PARAM_VALUES);

const UPDATE_FIELD = "metabase/metadata/UPDATE_FIELD";
export const updateField = createThunkAction(UPDATE_FIELD, function(field) {
    return async function(dispatch, getState) {
        const requestStatePath = ["metadata", "fields", field.id];
        const existingStatePath = ["metadata", "fields"];
        const putData = async () => {
            // make sure we don't send all the computed metadata
            // there may be more that I'm missing?
            const slimField = _.omit(field, "operators_lookup");

            const updatedField = await MetabaseApi.field_update(slimField);
            return normalize(updatedField, FieldSchema);
        };

        return await updateData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            putData
        });
    };
});

const FETCH_REVISIONS = "metabase/metadata/FETCH_REVISIONS";
export const fetchRevisions = createThunkAction(FETCH_REVISIONS, (type, id, reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "revisions", type, id];
        const existingStatePath = ["metadata", "revisions"];
        const getData = async () => {
            const revisions = await RevisionsApi.get({id, entity: type});
            const revisionMap = resourceListToMap(revisions);

            const existingRevisions = getIn(getState(), existingStatePath);
            return assocIn(existingRevisions, [type, id], revisionMap);
        };

        return await fetchData({
            dispatch,
            getState,
            requestStatePath,
            existingStatePath,
            getData,
            reload
        });
    };
});

// for fetches with data dependencies in /reference
const FETCH_METRIC_TABLE = "metabase/metadata/FETCH_METRIC_TABLE";
export const fetchMetricTable = createThunkAction(FETCH_METRIC_TABLE, (metricId, reload = false) => {
    return async (dispatch, getState) => {
        await dispatch(fetchMetrics()); // FIXME: fetchMetric?
        const metric = getIn(getState(), ['metadata', 'metrics', metricId]);
        const tableId = metric.table_id;
        await dispatch(fetchTableMetadata(tableId));
    };
});

const FETCH_METRIC_REVISIONS = "metabase/metadata/FETCH_METRIC_REVISIONS";
export const fetchMetricRevisions = createThunkAction(FETCH_METRIC_REVISIONS, (metricId, reload = false) => {
    return async (dispatch, getState) => {
        await Promise.all([
            dispatch(fetchRevisions('metric', metricId)),
            dispatch(fetchMetrics())
        ]);
        const metric = getIn(getState(), ['metadata', 'metrics', metricId]);
        const tableId = metric.table_id;
        await dispatch(fetchTableMetadata(tableId));
    };
});

const FETCH_SEGMENT_FIELDS = "metabase/metadata/FETCH_SEGMENT_FIELDS";
export const fetchSegmentFields = createThunkAction(FETCH_SEGMENT_FIELDS, (segmentId, reload = false) => {
    return async (dispatch, getState) => {
        await dispatch(fetchSegments()); // FIXME: fetchSegment?
        const segment = getIn(getState(), ['metadata', 'segments', segmentId]);
        const tableId = segment.table_id;
        await dispatch(fetchTableMetadata(tableId));
        const table = getIn(getState(), ['metadata', 'tables', tableId]);
        const databaseId = table.db_id;
        await dispatch(fetchDatabaseMetadata(databaseId));
    };
});

const FETCH_SEGMENT_TABLE = "metabase/metadata/FETCH_SEGMENT_TABLE";
export const fetchSegmentTable = createThunkAction(FETCH_SEGMENT_TABLE, (segmentId, reload = false) => {
    return async (dispatch, getState) => {
        await dispatch(fetchSegments()); // FIXME: fetchSegment?
        const segment = getIn(getState(), ['metadata', 'segments', segmentId]);
        const tableId = segment.table_id;
        await dispatch(fetchTableMetadata(tableId));
    };
});

const FETCH_SEGMENT_REVISIONS = "metabase/metadata/FETCH_SEGMENT_REVISIONS";
export const fetchSegmentRevisions = createThunkAction(FETCH_SEGMENT_REVISIONS, (segmentId, reload = false) => {
    return async (dispatch, getState) => {
        await Promise.all([
            dispatch(fetchRevisions('segment', segmentId)),
            dispatch(fetchSegments())
        ]);
        const segment = getIn(getState(), ['metadata', 'segments', segmentId]);
        const tableId = segment.table_id;
        await dispatch(fetchTableMetadata(tableId));
    };
});

const FETCH_DATABASES_WITH_METADATA = "metabase/metadata/FETCH_DATABASES_WITH_METADATA";
export const fetchDatabasesWithMetadata = createThunkAction(FETCH_DATABASES_WITH_METADATA, (reload = false) => {
    return async (dispatch, getState) => {
        await dispatch(fetchDatabases());
        const databases = getIn(getState(), ['metadata', 'databases']);
        await Promise.all(Object.values(databases).map(database =>
            dispatch(fetchDatabaseMetadata(database.id))
        ));
    };
});

const databases = handleActions({
}, {});

const databasesList = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => (payload && payload.result) || state }
}, []);

const tables = handleActions({
}, {});

const fields = handleActions({
    [FETCH_FIELD_VALUES]: { next: (state, { payload: fieldValues }) =>
        fieldValues ? assocIn(state, [fieldValues.field_id, "values"], fieldValues) : state },
    [ADD_PARAM_VALUES]: { next: (state, { payload: paramValues }) => {
        for (const fieldValues of Object.values(paramValues)) {
            state = assocIn(state, [fieldValues.field_id, "values"], fieldValues);
        }
        return state;
    }}
}, {});

const metrics = handleActions({
}, {});

const segments = handleActions({
}, {});

const revisions = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload }) => payload }
}, {});

// merge each entity from newEntities with existing entity, if any
// this ensures partial entities don't overwrite existing entities with more properties
function mergeEntities(entities, newEntities) {
    entities = { ...entities };
    for (const id in newEntities) {
        if (id in entities) {
            entities[id] = { ...entities[id], ...newEntities[id] };
        } else {
            entities[id] = newEntities[id];
        }
    }
    return entities;
}

// reducer that merges payload.entities
function handleEntities(actionPattern, entityType, reducer) {
    return (state, action) => {
        if (state === undefined) {
            state = {};
        }
        let entities = getIn(action, ["payload", "entities", entityType])
        if (actionPattern.test(action.type) && entities) {
            state = mergeEntities(state, entities);
        }
        return reducer(state, action);
    }
}

export default combineReducers({
    metrics:   handleEntities(/^metabase\/metadata\//, "metrics", metrics),
    segments:  handleEntities(/^metabase\/metadata\//, "segments", segments),
    databases: handleEntities(/^metabase\/metadata\//, "databases", databases),
    tables:    handleEntities(/^metabase\/metadata\//, "tables", tables),
    fields:    handleEntities(/^metabase\/metadata\//, "fields", fields),
    revisions,
    databasesList,
});
