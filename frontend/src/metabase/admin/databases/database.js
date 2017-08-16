import _ from "underscore";

import { createAction } from "redux-actions";
import { handleActions, combineReducers, createThunkAction } from "metabase/lib/redux";
import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import { MetabaseApi } from "metabase/services";

export const RESET = "metabase/admin/databases/RESET";
export const SELECT_ENGINE = "metabase/admin/databases/SELECT_ENGINE";
export const FETCH_DATABASES = "metabase/admin/databases/FETCH_DATABASES";
export const INITIALIZE_DATABASE = "metabase/admin/databases/INITIALIZE_DATABASE";
export const ADD_SAMPLE_DATASET = "metabase/admin/databases/ADD_SAMPLE_DATASET";
export const SAVE_DATABASE = "metabase/admin/databases/SAVE_DATABASE";
export const DELETE_DATABASE = "metabase/admin/databases/DELETE_DATABASE";
export const SYNC_DATABASE_SCHEMA = "metabase/admin/databases/SYNC_DATABASE_SCHEMA";
export const RESCAN_DATABASE_FIELDS = "metabase/admin/databases/RESCAN_DATABASE_FIELDS";
export const DISCARD_SAVED_FIELD_VALUES = "metabase/admin/databases/DISCARD_SAVED_FIELD_VALUES";
export const UPDATE_DATABASE = 'metabase/admin/databases/UPDATE_DATABASE'
export const UPDATE_DATABASE_STARTED = 'metabase/admin/databases/UPDATE_DATABASE_STARTED'
export const UPDATE_DATABASE_FAILED = 'metabase/admin/databases/UPDATE_DATABASE_FAILED'
export const CREATE_DATABASE = 'metabase/admin/databases/CREATE_DATABASE'
export const CREATE_DATABASE_STARTED = 'metabase/admin/databases/CREATE_DATABASE_STARTED'
export const CREATE_DATABASE_FAILED = 'metabase/admin/databases/CREATE_DATABASE_FAILED'
export const DELETE_DATABASE_STARTED = 'metabase/admin/databases/DELETE_DATABASE_STARTED'
export const DELETE_DATABASE_FAILED = "metabase/admin/databases/DELETE_DATABASE_FAILED";

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

export const createDatabase = function (database) {
    return async function (dispatch, getState) {
        try {
            dispatch.action(CREATE_DATABASE_STARTED, { database })
            const createdDatabase = await MetabaseApi.db_create(database);
            MetabaseAnalytics.trackEvent("Databases", "Create", database.engine);

            // update the db metadata already here because otherwise there will be a gap between "Adding..." status
            // and seeing the db that was just added
            await dispatch(fetchDatabases())

            if (database.details["let-user-control-scheduling"]) {
                // Move to the scheduling settings
                dispatch(push(`/admin/databases/${createdDatabase.id}?showSchedulingAfterDbCreation`));
            } else {
                dispatch(push('/admin/databases?created=' + createdDatabase.id));
                dispatch.action(CREATE_DATABASE, { database: createdDatabase })
            }
        } catch (error) {
            console.error("error creating a database", error);
            MetabaseAnalytics.trackEvent("Databases", "Create Failed", database.engine);
            dispatch.action(CREATE_DATABASE_FAILED, { database, error })
        }
    };
}

export const updateDatabase = function(database) {
    return async function(dispatch, getState) {
        try {
            dispatch.action(UPDATE_DATABASE_STARTED, { database })
            const savedDatabase = await MetabaseApi.db_update(database);
            MetabaseAnalytics.trackEvent("Databases", "Update", database.engine);

            dispatch.action(UPDATE_DATABASE, { database: savedDatabase })
        } catch (error) {
            MetabaseAnalytics.trackEvent("Databases", "Update Failed", database.engine);
            dispatch.action(UPDATE_DATABASE_FAILED, { error });
        }
    };
};

// NOTE Atte Keinänen 7/26/17: Original monolithic saveDatabase was broken out to smaller actions
// but `saveDatabase` action creator is still left here for keeping the interface for React components unchanged
export const saveDatabase = function(database, details) {
    // If we don't let user control the scheduling settings, let's override them with Metabase defaults
    // TODO Atte Keinänen 8/15/17: Implement engine-specific scheduling defaults
    const letUserControlScheduling = details["let-user-control-scheduling"];
    const overridesIfNoUserControl = letUserControlScheduling ? {} : {
        is_full_sync: true,
        schedules: {
            "cache_field_values": {
                "schedule_day": null,
                "schedule_frame": null,
                "schedule_hour": null,
                "schedule_type": "hourly"
            },
            "metadata_sync": {
                "schedule_day": null,
                "schedule_frame": null,
                "schedule_hour": null,
                "schedule_type": "hourly"
            }
        }
    }

    return async function(dispatch, getState) {
        const databaseWithDetails = {
            ...database,
            details,
            ...overridesIfNoUserControl
        };
        const isUnsavedDatabase = !databaseWithDetails.id
        if (isUnsavedDatabase) {
            dispatch(createDatabase(databaseWithDetails))
        } else {
            dispatch(updateDatabase(databaseWithDetails))
        }
    };
};

export const deleteDatabase = function(databaseId, isDetailView = true) {
    return async function(dispatch, getState) {
        try {
            dispatch.action(DELETE_DATABASE_STARTED, { databaseId })
            dispatch(push('/admin/databases/'));
            await MetabaseApi.db_delete({"dbId": databaseId});
            MetabaseAnalytics.trackEvent("Databases", "Delete", isDetailView ? "Using Detail" : "Using List");
            dispatch.action(DELETE_DATABASE, { databaseId })
        } catch(error) {
            console.log('error deleting database', error);
            dispatch.action(DELETE_DATABASE_FAILED, { databaseId, error })
        }
    };
}

// syncDatabaseSchema
export const syncDatabaseSchema = createThunkAction(SYNC_DATABASE_SCHEMA, function(databaseId) {
    return async function(dispatch, getState) {
        try {
            let call = await MetabaseApi.db_sync_schema({"dbId": databaseId});
            MetabaseAnalytics.trackEvent("Databases", "Manual Sync");
            return call;
        } catch(error) {
            console.log('error syncing database', error);
        }
    };
});

// rescanDatabaseFields
export const rescanDatabaseFields = createThunkAction(RESCAN_DATABASE_FIELDS, function(databaseId) {
    return async function(dispatch, getState) {
        try {
            let call = await MetabaseApi.db_rescan_values({"dbId": databaseId});
            MetabaseAnalytics.trackEvent("Databases", "Manual Sync");
            return call;
        } catch(error) {
            console.log('error syncing database', error);
        }
    };
});

// discardSavedFieldValues
export const discardSavedFieldValues = createThunkAction(DISCARD_SAVED_FIELD_VALUES, function(databaseId) {
    return async function(dispatch, getState) {
        try {
            let call = await MetabaseApi.db_discard_values({"dbId": databaseId});
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
    [DELETE_DATABASE]: (state, { payload: { databaseId} }) =>
        databaseId ? _.reject(state, (d) => d.id === databaseId) : state
}, null);

const editingDatabase = handleActions({
    [RESET]: { next: () => null },
    [INITIALIZE_DATABASE]: { next: (state, { payload }) => payload },
    [UPDATE_DATABASE]: { next: (state, { payload }) => payload.database || state },
    [DELETE_DATABASE]: { next: (state, { payload }) => null },
    [SELECT_ENGINE]: { next: (state, { payload }) => ({...state, engine: payload }) }
}, null);

const deletes = handleActions({
    [DELETE_DATABASE_STARTED]: (state, { payload: { databaseId } }) => state.concat([databaseId]),
    [DELETE_DATABASE_FAILED]: (state, { payload: { databaseId, error } }) => state.filter((dbId) => dbId !== databaseId),
    [DELETE_DATABASE]: (state, { payload: { databaseId } }) => state.filter((dbId) => dbId !== databaseId)
}, []);

const deletionError = handleActions({
    [DELETE_DATABASE_FAILED]: (state, { payload: { error } }) => error,
}, null)

const DEFAULT_FORM_STATE = { formSuccess: null, formError: null, isSubmitting: false };
const formState = handleActions({
    [RESET]: { next: () => DEFAULT_FORM_STATE },
    [CREATE_DATABASE_STARTED]: () => ({ isSubmitting: true }),
    // not necessarily needed as the page is immediately redirected after db creation
    [CREATE_DATABASE]: () => ({ formSuccess: { data: { message: "Successfully created!" } } }),
    [CREATE_DATABASE_FAILED]: (state, { payload: { error } }) => ({ formError: error }),
    [UPDATE_DATABASE_STARTED]: () => ({ isSubmitting: true }),
    [UPDATE_DATABASE]: () => ({ formSuccess: { data: { message: "Successfully saved!" } } }),
    [UPDATE_DATABASE_FAILED]: (state, { payload: { error } }) => ({ formError: error }),
}, DEFAULT_FORM_STATE);

export default combineReducers({
    databases,
    editingDatabase,
    deletionError,
    formState,
    deletes
});
