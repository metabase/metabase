import { handleActions, combineReducers, AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";
import { normalize, Schema, arrayOf } from 'normalizr';
import i from "icepick";

import { augmentDatabase, loadTableAndForeignKeys } from "metabase/lib/table";
import { setRequestState } from "./requests";

const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "db_metadata", "table_fields"]);
const MetricApi = new AngularResourceProxy("Metric", ["list"]);
const SegmentApi = new AngularResourceProxy("Segment", ["list"]);
const RevisionApi = new AngularResourceProxy("Revisions", ["get"]);

const resourceListToMap = (resources) => resources
    //filters out angular cruft
    .filter(resource => resource.id !== undefined)
    .reduce((map, resource) => i.assoc(map, resource.id, resource), {});

//TODO: test this thoroughly
export const fetchData = async ({dispatch, getState, statePath, existingStatePath, getData, reload}) => {
    const existingData = i.getIn(getState(), existingStatePath || statePath);
    try {
        const requestState = i.getIn(getState(), ["requests", ...statePath]);

        if (!requestState || requestState.error || reload) {
            dispatch(setRequestState({ statePath, state: "LOADING" }));
            const data = await getData(existingData);
            dispatch(setRequestState({ statePath, state: "LOADED" }));

            return data;
        }

        return existingData;
    }
    catch(error) {
        dispatch(setRequestState({ statePath, error }));
        return existingData;
    }
}

const FETCH_METRICS = "metabase/metadata/FETCH_METRICS";
export const fetchMetrics = createThunkAction(FETCH_METRICS, (reload = false) => {
    return async (dispatch, getState) => {
        const statePath = ["metadata", "metrics"];
        const getData = async () => {
            const metrics = await MetricApi.list();
            const metricMap = resourceListToMap(metrics);
            return metricMap;
        };

        return await fetchData({dispatch, getState, statePath, getData, reload});
    };
});

const metrics = handleActions({
    [FETCH_METRICS]: { next: (state, { payload }) => payload }
}, {});

const FETCH_LISTS = "metabase/metadata/FETCH_LISTS";
export const fetchLists = createThunkAction(FETCH_LISTS, (reload = false) => {
    return async (dispatch, getState) => {
        const statePath = ["metadata", "lists"];
        const getData = async () => {
            const lists = await SegmentApi.list();
            const listMap = resourceListToMap(lists);
            return listMap;
        };

        return await fetchData({dispatch, getState, statePath, getData, reload});
    };
});

const lists = handleActions({
    [FETCH_LISTS]: { next: (state, { payload }) => payload }
}, {});

const FETCH_DATABASES = "metabase/metadata/FETCH_DATABASES";
export const fetchDatabases = createThunkAction(FETCH_DATABASES, (reload = false) => {
    return async (dispatch, getState) => {
        const statePath = ["metadata", "databases"];
        const getData = async (existingDatabases) => {
            const databases = await MetabaseApi.db_list();
            const databaseMap = resourceListToMap(databases);
            // to ensure existing databases with fetched metadata doesn't get
            // overwritten when loading out of order, unless explicitly reloading
            return {...databaseMap, ...existingDatabases};
        };

        return await fetchData({dispatch, getState, statePath, getData, reload});
    };
});

const FETCH_DATABASE_METADATA = "metabase/metadata/FETCH_DATABASE_METADATA";
export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId, reload = false) {
    return async function(dispatch, getState) {
        const statePath = ["metadata", "databases", dbId];
        const existingStatePath = ["metadata"];
        const getData = async () => {
            const databaseMetadata = await MetabaseApi.db_metadata({ dbId });
            augmentDatabase(databaseMetadata);

            const database = new Schema('databases');
            const table = new Schema('tables');
            database.define({
                tables: arrayOf(table)
            });

            return normalize(databaseMetadata, database).entities;
        };

        return await fetchData({dispatch, getState, statePath, existingStatePath, getData, reload});
    };
});

const databases = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => payload },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, ...payload.databases }) }
}, {});

const FETCH_TABLE_FIELDS = "metabase/metadata/FETCH_TABLE_FIELDS";
export const fetchTableFields = createThunkAction(FETCH_TABLE_FIELDS, (tableId, reload = false) => {
    return async (dispatch, getState) => {
        const statePath = ["metadata", "tables", tableId, 'fields'];
        const existingStatePath = ["metadata", "tables"];
        const getData = async (existingTables) => {
            // no need to replace existing table since it would already have fields metadata
            if (existingTables[tableId]) {
                return existingTables;
            }
            const tableFields = await MetabaseApi.table_fields({ tableId });
            const fields = tableFields
                .filter(resource => resource.id !== undefined);
            const tables = i.assocIn(existingTables, [tableId], {id: tableId, fields});

            return tables;
        };

        return await fetchData({dispatch, getState, statePath, existingStatePath, getData, reload});
    };
});

const FETCH_TABLE_METADATA = "metabase/metadata/FETCH_TABLE_METADATA";
export const fetchTableMetadata = createThunkAction(FETCH_TABLE_METADATA, function(tableId, reload = false) {
    return async function(dispatch, getState) {
        const statePath = ["metadata", "tables", tableId];
        const existingStatePath = ["metadata", "tables"];
        const getData = async (existingTables) => {
            // no need to replace existing table since it would already have fields metadata
            if (existingTables[tableId]) {
                return existingTables;
            }
            const { table } = await loadTableAndForeignKeys(tableId);
            const tables = i.assoc(existingTables, tableId, table);

            return tables;
        };

        return await fetchData({dispatch, getState, statePath, existingStatePath, getData, reload});
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
        const statePath = ["metadata", "revisions", type, id];
        const existingStatePath = ["metadata", "revisions"];
        const getData = async (existingRevisions) => {
            const revisionType = type === 'list' ? 'segment' : type;
            const revisions = await RevisionApi.get({id, entity: revisionType});
            const revisionMap = resourceListToMap(revisions);

            return i.assocIn(existingRevisions, [type, id], revisionMap);
        };

        return await fetchData({dispatch, getState, statePath, existingStatePath, getData, reload});
    };
});

const revisions = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload }) => payload }
}, {});

export default combineReducers({
    metrics,
    lists,
    databases,
    tables,
    revisions
});
