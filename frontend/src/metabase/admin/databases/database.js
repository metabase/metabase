import _ from "underscore";

import { createAction } from "redux-actions";
import { handleActions, combineReducers, createThunkAction } from "metabase/lib/redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import { MetabaseApi } from "metabase/services";

const RESET = "metabase/admin/databases/RESET";
const SELECT_ENGINE = "metabase/admin/databases/SELECT_ENGINE";
const FETCH_DATABASES = "metabase/admin/databases/FETCH_DATABASES";
const INITIALIZE_DATABASE = "metabase/admin/databases/INITIALIZE_DATABASE";
const ADD_SAMPLE_DATASET = "metabase/admin/databases/ADD_SAMPLE_DATASET";
const SAVE_DATABASE = "metabase/admin/databases/SAVE_DATABASE";
const DELETE_DATABASE = "metabase/admin/databases/DELETE_DATABASE";
const SYNC_DATABASE = "metabase/admin/databases/SYNC_DATABASE";

export const reset = createAction(RESET);

// selectEngine (uiControl)
export const selectEngine = createAction(SELECT_ENGINE);

// fetchDatabases
export const fetchDatabases = createThunkAction(FETCH_DATABASES, function() {
    return async function(dispatch, getState) {
        try {
            return await MetabaseApi.db_list();
        } catch(error) {
            console.error("error fetching databases", error);
        }
    };
});

// initializeDatabase
export const initializeDatabase = createThunkAction(INITIALIZE_DATABASE, function(databaseId) {
    return async function(dispatch, getState) {
        if (databaseId) {
            try {
                return await MetabaseApi.db_get({"dbId": databaseId});
            } catch (error) {
                if (error.status == 404) {
                    //$location.path('/admin/databases/');
                } else {
                    console.error("error fetching database", databaseId, error);
                }
            }
        } else {
            return {
                name: '',
                engine: Object.keys(MetabaseSettings.get('engines'))[0],
                details: {},
                created: false
            }
        }
    }
})


// addSampleDataset
export const addSampleDataset = createThunkAction(ADD_SAMPLE_DATASET, function() {
    return async function(dispatch, getState) {
        try {
            let sampleDataset = await MetabaseApi.db_add_sample_dataset();
            MetabaseAnalytics.trackEvent("Databases", "Add Sample Data");
            return sampleDataset;
        } catch(error) {
            console.error("error adding sample dataset", error);
            return error;
        }
    };
});

// saveDatabase
export const saveDatabase = createThunkAction(SAVE_DATABASE, function(database, details) {
    return async function(dispatch, getState) {
        let savedDatabase, formState;

        try {
            //$scope.$broadcast("form:reset");
            database.details = details;
            if (database.id) {
                //$scope.$broadcast("form:api-success", "Successfully saved!");
                savedDatabase = await MetabaseApi.db_update(database);
                MetabaseAnalytics.trackEvent("Databases", "Update", database.engine);
            } else {
                //$scope.$broadcast("form:api-success", "Successfully created!");
                //$scope.$emit("database:created", new_database);
                savedDatabase = await MetabaseApi.db_create(database);
                MetabaseAnalytics.trackEvent("Databases", "Create", database.engine);
                dispatch(push('/admin/databases?created='+savedDatabase.id));
            }

            // this object format is what FormMessage expects:
            formState = { formSuccess: { data: { message: "Successfully saved!" }}};

        } catch (error) {
            //$scope.$broadcast("form:api-error", error);
            console.error("error saving database", error);
            MetabaseAnalytics.trackEvent("Databases", database.id ? "Update Failed" : "Create Failed", database.engine);
            formState = { formError: error };
        }

        return {
            database: savedDatabase,
            formState
        }
    };
});

// deleteDatabase
export const deleteDatabase = createThunkAction(DELETE_DATABASE, function(databaseId, redirect=false) {
    return async function(dispatch, getState) {
        try {
            await MetabaseApi.db_delete({"dbId": databaseId});
            MetabaseAnalytics.trackEvent("Databases", "Delete", redirect ? "Using Detail" : "Using List");
            if (redirect) {
                dispatch(push('/admin/databases/'));
            }
            return databaseId;
        } catch(error) {
            console.log('error deleting database', error);
        }
    };
});

// syncDatabase
export const syncDatabase = createThunkAction(SYNC_DATABASE, function(databaseId) {
    return function(dispatch, getState) {
        try {
            let call = MetabaseApi.db_sync_metadata({"dbId": databaseId});
            MetabaseAnalytics.trackEvent("Databases", "Manual Sync");
            return call;
        } catch(error) {
            console.log('error syncing database', error);
        }
    };
});


// reducers

const databases = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => payload },
    [ADD_SAMPLE_DATASET]: { next: (state, { payload }) => payload ? [...state, payload] : state },
    [DELETE_DATABASE]: { next: (state, { payload }) => payload ? _.reject(state, (d) => d.id === payload) : state }
}, null);

const editingDatabase = handleActions({
    [RESET]: { next: () => null },
    [INITIALIZE_DATABASE]: { next: (state, { payload }) => payload },
    [SAVE_DATABASE]: { next: (state, { payload }) => payload.database || state },
    [DELETE_DATABASE]: { next: (state, { payload }) => null },
    [SELECT_ENGINE]: { next: (state, { payload }) => ({...state, engine: payload }) }
}, null);

const DEFAULT_FORM_STATE = { formSuccess: null, formError: null };
const formState = handleActions({
    [RESET]: { next: () => DEFAULT_FORM_STATE },
    [SAVE_DATABASE]: { next: (state, { payload }) => payload.formState }
}, DEFAULT_FORM_STATE);

export default combineReducers({
    databases,
    editingDatabase,
    formState
});
