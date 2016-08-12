import {
    handleActions,
    combineReducers,
    AngularResourceProxy,
    createThunkAction,
    resourceListToMap,
    cleanResource
} from "metabase/lib/redux";

import { normalize, Schema, arrayOf } from 'normalizr';
import i from "icepick";
import _ from "underscore";

import { augmentDatabase, augmentTable } from "metabase/lib/table";
import { setRequestState, clearRequestState } from "./requests";

const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "db_update", "db_metadata", "table_list", "table_update", "table_query_metadata", "field_update"]);
const MetricApi = new AngularResourceProxy("Metric", ["list", "update"]);
const SegmentApi = new AngularResourceProxy("Segment", ["list", "update"]);
const RevisionApi = new AngularResourceProxy("Revisions", ["get"]);

const database = new Schema('databases');
const table = new Schema('tables');
const field = new Schema('fields');
database.define({
    tables: arrayOf(table)
});
table.define({
    fields: arrayOf(field)
});

export const fetchData = async ({dispatch, getState, requestStatePath, existingStatePath, getData, reload}) => {
    const existingData = i.getIn(getState(), existingStatePath);
    const statePath = requestStatePath.concat(['fetch']);
    try {
        const requestState = i.getIn(getState(), ["requests", ...statePath]);
        if (!requestState || requestState.error || reload) {
            dispatch(setRequestState({ statePath, state: "LOADING" }));
            const data = await getData();
            dispatch(setRequestState({ statePath, state: "LOADED" }));

            return data;
        }

        return existingData;
    }
    catch(error) {
        dispatch(setRequestState({ statePath, error }));
        console.error(error);
        return existingData;
    }
}

export const updateData = async ({dispatch, getState, requestStatePath, existingStatePath, putData}) => {
    const existingData = i.getIn(getState(), existingStatePath);
    const statePath = requestStatePath.concat(['update']);
    try {
        dispatch(setRequestState({ statePath, state: "LOADING" }));
        const data = await putData();
        dispatch(setRequestState({ statePath, state: "LOADED" }));

        return data;
    }
    catch(error) {
        dispatch(setRequestState({ statePath, error }));
        console.error(error);
        return existingData;
    }
}

const FETCH_METRICS = "metabase/metadata/FETCH_METRICS";
export const fetchMetrics = createThunkAction(FETCH_METRICS, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "metrics"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const metrics = await MetricApi.list();
            const metricMap = resourceListToMap(metrics);
            return metricMap;
        };

        return await fetchData({dispatch, getState, requestStatePath, existingStatePath, getData, reload});
    };
});

const UPDATE_METRIC = "metabase/metadata/UPDATE_METRIC";
export const updateMetric = createThunkAction(UPDATE_METRIC, function(metric) {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "metrics", metric.id];
        const existingStatePath = ["metadata", "metrics"];
        const putData = async () => {
            //FIXME: need to clear requestState for revisions for it to reload
            const updatedMetric = await MetricApi.update(metric);
            const cleanMetric = cleanResource(updatedMetric);
            const existingMetrics = i.getIn(getState(), existingStatePath);
            const existingMetric = existingMetrics[metric.id];

            const mergedMetric = {...existingMetric, ...cleanMetric};

            dispatch(clearRequestState({statePath: ['metadata', 'revisions', 'metric', metric.id]}));
            return i.assoc(existingMetrics, mergedMetric.id, mergedMetric);
        };

        return await updateData({dispatch, getState, requestStatePath, existingStatePath, putData});
    };
});

const metrics = handleActions({
    [FETCH_METRICS]: { next: (state, { payload }) => payload },
    [UPDATE_METRIC]: { next: (state, { payload }) => payload }
}, {});

const FETCH_SEGMENTS = "metabase/metadata/FETCH_SEGMENTS";
export const fetchSegments = createThunkAction(FETCH_SEGMENTS, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "segments"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const segments = await SegmentApi.list();
            const segmentMap = resourceListToMap(segments);
            return segmentMap;
        };

        return await fetchData({dispatch, getState, requestStatePath, existingStatePath, getData, reload});
    };
});

const UPDATE_SEGMENT = "metabase/metadata/UPDATE_SEGMENT";
export const updateSegment = createThunkAction(UPDATE_SEGMENT, function(segment) {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "segments", segment.id];
        const existingStatePath = ["metadata", "segments"];
        const putData = async () => {
            const updatedSegment = await SegmentApi.update(segment);
            const cleanSegment = cleanResource(updatedSegment);
            const existingSegments = i.getIn(getState(), existingStatePath);
            const existingSegment = existingSegments[segment.id];

            const mergedSegment = {...existingSegment, ...cleanSegment};

            dispatch(clearRequestState({statePath: ['metadata', 'revisions', 'segment', segment.id]}));
            return i.assoc(existingSegments, mergedSegment.id, mergedSegment);
        };

        return await updateData({dispatch, getState, requestStatePath, existingStatePath, putData});
    };
});

const segments = handleActions({
    [FETCH_SEGMENTS]: { next: (state, { payload }) => payload },
    [UPDATE_SEGMENT]: { next: (state, { payload }) => payload }
}, {});

const FETCH_DATABASES = "metabase/metadata/FETCH_DATABASES";
export const fetchDatabases = createThunkAction(FETCH_DATABASES, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "databases"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const databases = await MetabaseApi.db_list();
            const databaseMap = resourceListToMap(databases);
            const existingDatabases = i.getIn(getState(), existingStatePath);

            // to ensure existing databases with fetched metadata doesn't get
            // overwritten when loading out of order, unless explicitly reloading
            return {...databaseMap, ...existingDatabases};
        };

        return await fetchData({dispatch, getState, requestStatePath, existingStatePath, getData, reload});
    };
});

const FETCH_DATABASE_METADATA = "metabase/metadata/FETCH_DATABASE_METADATA";
export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId, reload = false) {
    return async function(dispatch, getState) {
        const requestStatePath = ["metadata", "databases", dbId];
        const existingStatePath = ["metadata"];
        const getData = async () => {
            const databaseMetadata = await MetabaseApi.db_metadata({ dbId });
            await augmentDatabase(databaseMetadata);

            return normalize(databaseMetadata, database).entities;
        };

        return await fetchData({dispatch, getState, requestStatePath, existingStatePath, getData, reload});
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

            const cleanDatabase = cleanResource(updatedDatabase);
            const existingDatabases = i.getIn(getState(), existingStatePath);
            const existingDatabase = existingDatabases[database.id];

            const mergedDatabase = {...existingDatabase, ...cleanDatabase};

            return i.assoc(existingDatabases, mergedDatabase.id, mergedDatabase);
        };

        return await updateData({dispatch, getState, requestStatePath, existingStatePath, putData});
    };
});

const databases = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => payload },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.databases }) },
    [UPDATE_DATABASE]: { next: (state, { payload }) => payload }
}, {});

const UPDATE_TABLE = "metabase/metadata/UPDATE_TABLE";
export const updateTable = createThunkAction(UPDATE_TABLE, function(table) {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "tables", table.id];
        const existingStatePath = ["metadata", "tables"];
        const putData = async () => {
            // make sure we don't send all the computed metadata
            const slimTable = _.omit(table, "fields", "fields_lookup", "aggregation_options", "breakout_options", "metrics", "segments");

            const updatedTable = await MetabaseApi.table_update(slimTable);

            const cleanTable = cleanResource(updatedTable);
            const existingTables = i.getIn(getState(), existingStatePath);
            const existingTable = existingTables[table.id];

            const mergedTable = {...existingTable, ...cleanTable};

            return i.assoc(existingTables, mergedTable.id, mergedTable);
        };

        return await updateData({dispatch, getState, requestStatePath, existingStatePath, putData});
    };
});

const FETCH_TABLES = "metabase/metadata/FETCH_TABLES";
export const fetchTables = createThunkAction(FETCH_TABLES, (reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "tables"];
        const existingStatePath = requestStatePath;
        const getData = async () => {
            const tables = await MetabaseApi.table_list();
            const tableMap = resourceListToMap(tables);
            const existingTables = i.getIn(getState(), existingStatePath);
            // to ensure existing tables with fetched metadata doesn't get
            // overwritten when loading out of order, unless explicitly reloading
            return {...tableMap, ...existingTables};
        };

        return await fetchData({dispatch, getState, requestStatePath, existingStatePath, getData, reload});
    };
});

const FETCH_TABLE_METADATA = "metabase/metadata/FETCH_TABLE_METADATA";
export const fetchTableMetadata = createThunkAction(FETCH_TABLE_METADATA, function(tableId, reload = false) {
    return async function(dispatch, getState) {
        const requestStatePath = ["metadata", "tables", tableId];
        const existingStatePath = ["metadata"];
        const getData = async () => {
            const tableMetadata = await MetabaseApi.table_query_metadata({ tableId });
            await augmentTable(tableMetadata);

            return normalize(tableMetadata, table).entities;
        };

        return await fetchData({dispatch, getState, requestStatePath, existingStatePath, getData, reload});
    };
});

const tables = handleActions({
    [UPDATE_TABLE]: { next: (state, { payload }) => payload },
    [FETCH_TABLES]: { next: (state, { payload }) => payload },
    [FETCH_TABLE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.tables }) },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.tables }) }
}, {});

const UPDATE_FIELD = "metabase/metadata/UPDATE_FIELD";
export const updateField = createThunkAction(UPDATE_FIELD, function(field) {
    return async function(dispatch, getState) {
        const requestStatePath = ["metadata", "fields", field.id];
        const existingStatePath = ["metadata", "fields"];
        const putData = async () => {
            // make sure we don't send all the computed metadata
            // there may be more that I'm missing?
            const slimField = _.omit(field, "operators_lookup");

            const fieldMetadata = await MetabaseApi.field_update(slimField);
            const cleanField = cleanResource(fieldMetadata);
            const existingFields = i.getIn(getState(), existingStatePath);
            const existingField = existingFields[field.id];

            const mergedField = {...existingField, ...cleanField};

            return i.assoc(existingFields, mergedField.id, mergedField);
        };

        return await updateData({dispatch, getState, requestStatePath, existingStatePath, putData});
    };
});

const fields = handleActions({
    [FETCH_TABLE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.fields }) },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.fields }) },
    [UPDATE_FIELD]: { next: (state, { payload }) => payload }
}, {});

const FETCH_REVISIONS = "metabase/metadata/FETCH_REVISIONS";
export const fetchRevisions = createThunkAction(FETCH_REVISIONS, (type, id, reload = false) => {
    return async (dispatch, getState) => {
        const requestStatePath = ["metadata", "revisions", type, id];
        const existingStatePath = ["metadata", "revisions"];
        const getData = async () => {
            const revisions = await RevisionApi.get({id, entity: type});
            const revisionMap = resourceListToMap(revisions);

            const existingRevisions = i.getIn(getState(), existingStatePath);
            return i.assocIn(existingRevisions, [type, id], revisionMap);
        };

        return await fetchData({dispatch, getState, requestStatePath, existingStatePath, getData, reload});
    };
});

const revisions = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload }) => payload }
}, {});

// for fetches with data dependencies in /reference
const FETCH_METRIC_TABLE = "metabase/metadata/FETCH_METRIC_TABLE";
export const fetchMetricTable = createThunkAction(FETCH_METRIC_TABLE, (metricId, reload = false) => {
    return async (dispatch, getState) => {
        await dispatch(fetchMetrics());
        const metric = i.getIn(getState(), ['metadata', 'metrics', metricId]);
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
        const metric = i.getIn(getState(), ['metadata', 'metrics', metricId]);
        const tableId = metric.table_id;
        await dispatch(fetchTableMetadata(tableId));
    };
});

const FETCH_SEGMENT_FIELDS = "metabase/metadata/FETCH_SEGMENT_FIELDS";
export const fetchSegmentFields = createThunkAction(FETCH_SEGMENT_FIELDS, (segmentId, reload = false) => {
    return async (dispatch, getState) => {
        await dispatch(fetchSegments());
        const segment = i.getIn(getState(), ['metadata', 'segments', segmentId]);
        const tableId = segment.table_id;
        await dispatch(fetchTableMetadata(tableId));
        const table = i.getIn(getState(), ['metadata', 'tables', tableId]);
        const databaseId = table.db_id;
        await dispatch(fetchDatabaseMetadata(databaseId));
    };
});

const FETCH_SEGMENT_TABLE = "metabase/metadata/FETCH_SEGMENT_TABLE";
export const fetchSegmentTable = createThunkAction(FETCH_SEGMENT_TABLE, (segmentId, reload = false) => {
    return async (dispatch, getState) => {
        await dispatch(fetchSegments());
        const segment = i.getIn(getState(), ['metadata', 'segments', segmentId]);
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
        const segment = i.getIn(getState(), ['metadata', 'segments', segmentId]);
        const tableId = segment.table_id;
        await dispatch(fetchTableMetadata(tableId));
    };
});

export default combineReducers({
    metrics,
    segments,
    databases,
    tables,
    fields,
    revisions
});
