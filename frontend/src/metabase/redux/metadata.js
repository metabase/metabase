import { handleActions, combineReducers, AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";
import { normalize, Schema, arrayOf } from 'normalizr';
import i from "icepick";

import { augmentDatabase, loadTableAndForeignKeys } from "metabase/lib/table";
import { setRequest } from "./requests";

const database = new Schema('databases');
const table = new Schema('tables');
database.define({
    tables: arrayOf(table)
});

const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "db_metadata", "table_fields"]);
const MetricApi = new AngularResourceProxy("Metric", ["list"]);
const SegmentApi = new AngularResourceProxy("Segment", ["list"]);
const RevisionApi = new AngularResourceProxy("Revisions", ["get"]);


const resourceListToMap = (resources) => resources
    //filters out angular cruft
    .filter(resource => resource.id !== undefined)
    .reduce((map, resource) => i.assoc(map, resource.id, resource), {});

const FETCH_METRICS = "metabase/metadata/FETCH_METRICS";
//TODO: refactor fetching actions with similar logic
export const fetchMetrics = createThunkAction(FETCH_METRICS, (reload = false) => {
    return async (dispatch, getState) => {
        const existingMetrics = i.getIn(getState(), ["metadata", "metrics"]);
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/metrics"]);

            if (!requestState || requestState.error || reload) {
                dispatch(setRequest({ type: "metadata/metrics", state: "LOADING" }));

                const metrics = await MetricApi.list();
                const metricMap = resourceListToMap(metrics);
                dispatch(setRequest({ type: "metadata/metrics", state: "LOADED" }));

                return metricMap;
            }

            return existingMetrics;
        }
        catch(error) {
            dispatch(setRequest(error, { type: 'metadata/metrics' }));
            return existingMetrics;
        }
    };
});

const metrics = handleActions({
    [FETCH_METRICS]: { next: (state, { payload }) => payload }
}, {});

const FETCH_LISTS = "metabase/metadata/FETCH_LISTS";

export const fetchLists = createThunkAction(FETCH_LISTS, (reload = false) => {
    return async (dispatch, getState) => {
        const existingLists = i.getIn(getState(), ["metadata", "lists"]);
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/lists"]);

            if (!requestState || requestState.error || reload) {
                dispatch(setRequest({ type: "metadata/lists", state: "LOADING" }));

                const lists = await SegmentApi.list();
                const listMap = resourceListToMap(lists);
                dispatch(setRequest({ type: "metadata/lists", state: "LOADED" }));

                return listMap;
            }

            return existingLists;
        }
        catch(error) {
            dispatch(setRequest(error, { type: 'metadata/lists' }));
            return existingLists;
        }
    };
});

const lists = handleActions({
    [FETCH_LISTS]: { next: (state, { payload }) => payload }
}, {});

const FETCH_DATABASES = "metabase/metadata/FETCH_DATABASES";
const FETCH_DATABASE_METADATA = "metabase/metadata/FETCH_DATABASE_METADATA";

export const fetchDatabases = createThunkAction(FETCH_DATABASES, (reload = false) => {
    return async (dispatch, getState) => {
        const existingDatabases = i.getIn(getState(), ["metadata", "databases"]);
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/databases"]);

            if (!requestState || requestState.error || reload) {
                dispatch(setRequest({ type: "metadata/databases", state: "LOADING" }));
                const databases = await MetabaseApi.db_list();
                const databaseMap = resourceListToMap(databases);

                dispatch(setRequest({ type: "metadata/databases", state: "LOADED" }));

                if (reload) {
                    // FIXME: might want to clear requeststates for database metadata when this happens
                    // reload param isn't actually being used with fetchDatabases yet though
                    return databaseMap;
                }

                // to ensure existing databases with fetched metadata doesn't get
                // overwritten when loading out of order, unless explicitly reloading
                return {...databaseMap, ...existingDatabases};
            }

            return existingDatabases;
        }
        catch(error) {
            dispatch(setRequest(error, { type: 'metadata/databases' }));
            return existingDatabases;
        }
    };
});

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId, reload = false) {
    return async function(dispatch, getState) {
        const existingMetadata = i.getIn(getState(), ["metadata"]);
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/database", dbId]);
            if (!requestState || requestState.error || reload) {
                dispatch(setRequest({ type: "metadata/database", id: dbId, state: "LOADING" }));
                const databaseMetadata = await MetabaseApi.db_metadata({ dbId });
                augmentDatabase(databaseMetadata);
                dispatch(setRequest({ type: "metadata/database", id: dbId, state: "LOADED" }));

                return normalize(databaseMetadata, database).entities;
            }

            return existingMetadata;
        }
        catch(error) {
            dispatch(setRequest(error, { type: 'metadata/database', id: dbId }));
            return existingMetadata;
        }
    };
});

const databases = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => payload },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.databases }) }
}, {});

const FETCH_TABLE_FIELDS = "metabase/metadata/FETCH_TABLE_FIELDS";
const FETCH_TABLE_METADATA = "metabase/metadata/FETCH_TABLE_METADATA";

export const fetchTableFields = createThunkAction(FETCH_TABLE_FIELDS, (tableId, reload = false) => {
    return async (dispatch, getState) => {
        const existingTables = i.getIn(getState(), ["metadata", "tables"]);
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/table_fields", tableId]);

            if (!tableId) {
                return existingTables;
            }

            // no need to replace existing table since it would already have fields metadata
            if (!requestState || !existingTables[tableId] || requestState.error || reload) {
                dispatch(setRequest({ type: "metadata/table_fields", id: tableId, state: "LOADING" }));
                const tableFields = await MetabaseApi.table_fields({ tableId });
                const fields = tableFields
                    .filter(resource => resource.id !== undefined);
                const tables = i.assocIn(existingTables, [tableId], {id: tableId, fields});

                dispatch(setRequest({ type: "metadata/table_fields", id: tableId, state: "LOADED" }));

                return tables;
            }

            return existingTables;
        }
        catch(error) {
            dispatch(setRequest(error, { type: 'metadata/table_fields', id: tableId }));
            return existingTables;
        }
    };
});

export const fetchTableMetadata = createThunkAction(FETCH_TABLE_METADATA, function(tableId, reload = false) {
    return async function(dispatch, getState) {
        const existingTables = i.getIn(getState(), ["metadata", 'tables']);
        const requestType = "metadata/table";

        if (!tableId) {
            return existingTables;
        }

        try {
            const requestState = i.getIn(getState(), ["requests", requestType, tableId]);
            if (!requestState || requestState.error || reload) {
                dispatch(setRequest({ type: requestType, id: tableId, state: "LOADING" }));
                const { table } = await loadTableAndForeignKeys(tableId);
                const tables = i.assoc(existingTables, tableId, table);
                dispatch(setRequest({ type: requestType, id: tableId, state: "LOADED" }));

                return tables;
            }

            return existingTables;
        }
        catch(error) {
            dispatch(setRequest(error, { type: requestType, id: tableId }));
            return existingTables;
        }
    };
});

const tables = handleActions({
    [FETCH_TABLE_FIELDS]: { next: (state, { payload }) => payload },
    [FETCH_TABLE_METADATA]: { next: (state, { payload }) => payload },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.tables }) }
}, {});

const FETCH_REVISIONS = "metabase/metadata/FETCH_REVISIONS";

export const fetchRevisions = createThunkAction(FETCH_REVISIONS, (type, id, reload = false) => {
    return async (dispatch, getState) => {
        const existingRevisions = i.getIn(getState(), ["metadata", "revisions"]);
        const requestType = `metadata/revisions/${type}`;
        try {
            const requestState = i.getIn(getState(), ["requests", requestType, id]);

            if (!requestState || requestState.error || reload) {
                dispatch(setRequest({ type: requestType, id, state: "LOADING" }));
                const revisionType = type === 'list' ? 'segment' : type;
                const revisions = await RevisionApi.get({id, entity: revisionType});
                const revisionMap = resourceListToMap(revisions);
                dispatch(setRequest({ type: requestType, id, state: "LOADED" }));

                return i.assocIn(existingRevisions, [type, id], revisionMap);
            }

            return existingRevisions;
        }
        catch(error) {
            dispatch(setRequest(error, { type: requestType, id }));
            return existingRevisions;
        }
    };
});

const revisions = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload }) => {console.log(payload);return payload} }
}, {});

export default combineReducers({
    metrics,
    lists,
    databases,
    tables,
    revisions
});
