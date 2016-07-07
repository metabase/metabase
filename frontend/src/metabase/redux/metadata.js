import { handleActions, combineReducers, AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";
import i from "icepick";

import { augmentDatabase } from "metabase/lib/table";

const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "dataset", "dataset_duration", "db_metadata"]);
const MetricApi = new AngularResourceProxy("Metric", ["list", "get"]);
const SegmentApi = new AngularResourceProxy("Segment", ["list", "get"]);

const SET_REQUEST_STATE = "metabase/metadata/SET_REQUEST_STATE";

const setRequestState = createAction(SET_REQUEST_STATE, undefined, (payload, meta) => meta);

const requestState = handleActions({
    [SET_REQUEST_STATE]: {
        next: (state, { payload }) => payload.id ?
            i.assocIn(state, [payload.type, payload.id], payload.state) :
            i.assoc(state, payload.type, payload.state),
        throw: (state, { payload, meta, error }) => meta.id ?
            i.assocIn(state, [meta.type, meta.id, 'error'], payload) :
            i.assocIn(state, [meta.type, 'error'], payload)
    }
}, {});

const resourceListToMap = (resources) => resources
    //filters out angular cruft
    .filter(resource => resource.id !== undefined)
    .reduce((map, resource) => i.assoc(map, resource.id, resource), {});

const FETCH_METRICS = "metabase/metadata/FETCH_METRICS";
//TODO: refactor fetching actions with similar logic
export const fetchMetrics = createThunkAction(FETCH_METRICS, (reload = false) => {
    return async (dispatch, getState) => {
        try {
            const requestState = i.getIn(getState(), ["metadata", "requestState", "metrics"]);
            const existingMetrics = i.getIn(getState(), ["metadata", "metrics"]);

            if (!requestState || reload) {
                dispatch(setRequestState({ type: "metrics", state: "LOADING" }));

                const metrics = await MetricApi.list();
                const metricMap = resourceListToMap(metrics);
                dispatch(setRequestState({ type: "metrics", state: "LOADED" }));

                return metricMap;
            }

            return existingMetrics;
        }
        catch(error) {
            dispatch(setRequestState(error, { type: 'metrics' }));
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
            const requestState = i.getIn(getState(), ["metadata", "requestState", "lists"]);
            const existingLists = i.getIn(getState(), ["metadata", "lists"]);

            if (!requestState || reload) {
                dispatch(setRequestState({ type: "lists", state: "LOADING" }));

                const lists = await SegmentApi.list();
                const listMap = resourceListToMap(lists);
                dispatch(setRequestState({ type: "lists", state: "LOADED" }));

                return listMap;
            }

            return existingLists;
        }
        catch(error) {
            dispatch(setRequestState(error, { type: 'lists' }));
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
            const requestState = i.getIn(getState(), ["metadata", "requestState", "databases"]);
            const existingDatabases = i.getIn(getState(), ["metadata", "databases"]);

            if (!requestState || reload) {
                dispatch(setRequestState({ type: "databases", state: "LOADING" }));
                const databases = await MetabaseApi.db_list();
                const databaseMap = resourceListToMap(databases);

                dispatch(setRequestState({ type: "databases", state: "LOADED" }));

                if (reload) {
                    return databaseMap;
                }

                // to ensure existing databases with fetched metadata doesn't get
                // overwritten when loading out of order, unless explicitly reloading
                return {...databaseMap, ...existingDatabases};
            }

            return existingDatabases;
        }
        catch(error) {
            dispatch(setRequestState(error, { type: 'databases' }));
            return {};
        }
    };
});

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId, reload = false) {
    return async function(dispatch, getState) {
        try {
            const requestState = i.getIn(getState(), ["metadata", "requestState", "database", dbId]);
            if (!requestState || reload) {
                dispatch(setRequestState({ type: "database", id: dbId, state: "LOADING" }));
                let databaseMetadata = await MetabaseApi.db_metadata({ dbId });
                augmentDatabase(databaseMetadata);
                dispatch(setRequestState({ type: "database", id: dbId, state: "LOADED" }));
                return databaseMetadata;
            }

            const existingDatabase = i.getIn(getState(), ["metadata", "databases", dbId]);
            return existingDatabase;
        }
        catch(error) {
            dispatch(setRequestState(error, { type: 'database', id: dbId }));
            return {};
        }
    };
});

const databases = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => payload },
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, [payload.id]: payload }) }
}, {});

export default combineReducers({
    requestState,
    metrics,
    lists,
    databases
});
