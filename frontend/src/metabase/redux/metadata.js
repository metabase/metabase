import { handleActions, combineReducers, AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";
import i from "icepick";

import { setRequest } from "./requests";

import { augmentDatabase } from "metabase/lib/table";

const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "dataset", "dataset_duration", "db_metadata"]);
const MetricApi = new AngularResourceProxy("Metric", ["list", "get"]);
const SegmentApi = new AngularResourceProxy("Segment", ["list", "get"]);

const resourceListToMap = (resources) => resources
    //filters out angular cruft
    .filter(resource => resource.id !== undefined)
    .reduce((map, resource) => i.assoc(map, resource.id, resource), {});

const FETCH_METRICS = "metabase/metadata/FETCH_METRICS";
//TODO: refactor fetching actions with similar logic
export const fetchMetrics = createThunkAction(FETCH_METRICS, (reload = false) => {
    return async (dispatch, getState) => {
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/metrics"]);
            const existingMetrics = i.getIn(getState(), ["metadata", "metrics"]);
            // FIXME: might also want to retry when requestState is an error
            if (!requestState || reload) {
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
            return {};
        }
    };
});

const metrics = handleActions({
    [FETCH_METRICS]: { next: (state, { payload }) => payload }
}, {});

const FETCH_LISTS = "metabase/metadata/FETCH_LISTS";

export const fetchLists = createThunkAction(FETCH_LISTS, (reload = false) => {
    return async (dispatch, getState) => {
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/lists"]);
            const existingLists = i.getIn(getState(), ["metadata", "lists"]);

            if (!requestState || reload) {
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
            return {};
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
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/databases"]);
            const existingDatabases = i.getIn(getState(), ["metadata", "databases"]);

            if (!requestState || reload) {
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
            return {};
        }
    };
});

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId, reload = false) {
    return async function(dispatch, getState) {
        try {
            const requestState = i.getIn(getState(), ["requests", "metadata/database", dbId]);
            if (!requestState || reload) {
                dispatch(setRequest({ type: "metadata/database", id: dbId, state: "LOADING" }));
                let databaseMetadata = await MetabaseApi.db_metadata({ dbId });
                augmentDatabase(databaseMetadata);
                dispatch(setRequest({ type: "metadata/database", id: dbId, state: "LOADED" }));
                return databaseMetadata;
            }

            const existingDatabase = i.getIn(getState(), ["metadata", "databases", dbId]);
            return existingDatabase;
        }
        catch(error) {
            dispatch(setRequest(error, { type: 'metadata/database', id: dbId }));
            return {};
        }
    };
});

const databases = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => payload },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, [payload.id]: payload }) }
}, {});

export default combineReducers({
    metrics,
    lists,
    databases
});
