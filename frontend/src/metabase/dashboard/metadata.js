
import { handleActions, combineReducers, AngularResourceProxy, createAction, createThunkAction } from "metabase/lib/redux";
import i from "icepick";

const FETCH_DATABASE_METADATA = "metabase/metadata/FETCH_DATABASE_METADATA";
const SET_REQUEST_STATE = "metabase/metadata/SET_REQUEST_STATE";

import { augmentDatabase } from "metabase/lib/table";

const MetabaseApi = new AngularResourceProxy("Metabase", ["dataset", "dataset_duration", "db_metadata"]);

const setRequestState = createAction(SET_REQUEST_STATE);

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(dbId) {
    return async function(dispatch, getState) {
        const requestState = i.getIn(getState(), ["metadata", "requestState", "database", dbId]);
        if (requestState !== "LOADING") {
            dispatch(setRequestState({ type: "database", id: dbId, state: "LOADING" }));
            let databaseMetadata = await MetabaseApi.db_metadata({ dbId });
            augmentDatabase(databaseMetadata);
            dispatch(setRequestState({ type: "database", id: dbId, state: "LOADED" }));
            return databaseMetadata;
        } else {
            return {};
        }
    };
});

const databases = handleActions({
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, [payload.id]: payload }) }
}, {});

const requestState = handleActions({
    [SET_REQUEST_STATE]: { next: (state, { payload }) => i.assocIn(state, [payload.type, payload.id], payload.state) }
}, {});

export default combineReducers({
    requestState,
    databases
});
