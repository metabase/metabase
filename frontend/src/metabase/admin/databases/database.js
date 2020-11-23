/* @flow weak */

import { createAction } from "redux-actions";
import {
  handleActions,
  combineReducers,
  createThunkAction,
} from "metabase/lib/redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import { MetabaseApi } from "metabase/services";
import Databases from "metabase/entities/databases";

// Default schedules for db sync and deep analysis
export const DEFAULT_SCHEDULES = {
  cache_field_values: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: 0,
    schedule_type: "daily",
  },
  metadata_sync: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: null,
    schedule_type: "hourly",
  },
};

export const DB_EDIT_FORM_CONNECTION_TAB = "connection";
export const DB_EDIT_FORM_SCHEDULING_TAB = "scheduling";

export const RESET = "metabase/admin/databases/RESET";
export const SELECT_ENGINE = "metabase/admin/databases/SELECT_ENGINE";
export const FETCH_DATABASES = "metabase/admin/databases/FETCH_DATABASES";
export const INITIALIZE_DATABASE =
  "metabase/admin/databases/INITIALIZE_DATABASE";
export const ADD_SAMPLE_DATASET = "metabase/admin/databases/ADD_SAMPLE_DATASET";
export const DELETE_DATABASE = "metabase/admin/databases/DELETE_DATABASE";
export const SYNC_DATABASE_SCHEMA =
  "metabase/admin/databases/SYNC_DATABASE_SCHEMA";
export const RESCAN_DATABASE_FIELDS =
  "metabase/admin/databases/RESCAN_DATABASE_FIELDS";
export const DISCARD_SAVED_FIELD_VALUES =
  "metabase/admin/databases/DISCARD_SAVED_FIELD_VALUES";
export const UPDATE_DATABASE = "metabase/admin/databases/UPDATE_DATABASE";
export const UPDATE_DATABASE_STARTED =
  "metabase/admin/databases/UPDATE_DATABASE_STARTED";
export const UPDATE_DATABASE_FAILED =
  "metabase/admin/databases/UPDATE_DATABASE_FAILED";
export const SET_DATABASE_CREATION_STEP =
  "metabase/admin/databases/SET_DATABASE_CREATION_STEP";
export const CREATE_DATABASE = "metabase/admin/databases/CREATE_DATABASE";
export const CREATE_DATABASE_STARTED =
  "metabase/admin/databases/CREATE_DATABASE_STARTED";
export const VALIDATE_DATABASE_STARTED =
  "metabase/admin/databases/VALIDATE_DATABASE_STARTED";
export const VALIDATE_DATABASE_FAILED =
  "metabase/admin/databases/VALIDATE_DATABASE_FAILED";
export const CREATE_DATABASE_FAILED =
  "metabase/admin/databases/CREATE_DATABASE_FAILED";
export const DELETE_DATABASE_STARTED =
  "metabase/admin/databases/DELETE_DATABASE_STARTED";
export const DELETE_DATABASE_FAILED =
  "metabase/admin/databases/DELETE_DATABASE_FAILED";
export const MIGRATE_TO_NEW_SCHEDULING_SETTINGS =
  "metabase/admin/databases/MIGRATE_TO_NEW_SCHEDULING_SETTINGS";

// NOTE: some but not all of these actions have been migrated to use metabase/entities/databases

export const reset = createAction(RESET);

// selectEngine (uiControl)
export const selectEngine = createAction(SELECT_ENGINE);

// Migrates old "Enable in-depth database analysis" option to new "Let me choose when Metabase syncs and scans" option
// Migration is run as a separate action because that makes it easy to track in tests
const migrateDatabaseToNewSchedulingSettings = database => {
  return async function(dispatch, getState) {
    if (database.details["let-user-control-scheduling"] == null) {
      dispatch.action(MIGRATE_TO_NEW_SCHEDULING_SETTINGS, {
        ...database,
        details: {
          ...database.details,
          // if user has enabled in-depth analysis already, we will run sync&scan in default schedule anyway
          // otherwise let the user control scheduling
          "let-user-control-scheduling": !database.is_full_sync,
        },
      });
    } else {
      console.log(
        `${MIGRATE_TO_NEW_SCHEDULING_SETTINGS} is no-op as scheduling settings are already set`,
      );
    }
  };
};

// initializeDatabase
export const initializeDatabase = function(databaseId) {
  return async function(dispatch, getState) {
    if (databaseId) {
      try {
        const action = await dispatch(
          Databases.actions.fetch({ id: databaseId }, { reload: true }),
        );
        const database = Databases.HACK_getObjectFromAction(action);
        dispatch.action(INITIALIZE_DATABASE, database);

        // If the new scheduling toggle isn't set, run the migration
        if (database.details["let-user-control-scheduling"] == null) {
          dispatch(migrateDatabaseToNewSchedulingSettings(database));
        }
      } catch (error) {
        if (error.status === 404) {
          //$location.path('/admin/databases/');
        } else {
          console.error("error fetching database", databaseId, error);
        }
      }
    } else {
      const newDatabase = {
        name: "",
        engine: Object.keys(MetabaseSettings.get("engines"))[0],
        details: {},
        created: false,
      };
      dispatch.action(INITIALIZE_DATABASE, newDatabase);
    }
  };
};

// addSampleDataset
export const addSampleDataset = createThunkAction(
  ADD_SAMPLE_DATASET,
  function() {
    return async function(dispatch, getState) {
      try {
        const sampleDataset = await MetabaseApi.db_add_sample_dataset();
        dispatch(Databases.actions.fetchList(undefined, { reload: true }));
        MetabaseAnalytics.trackEvent("Databases", "Add Sample Data");
        return sampleDataset;
      } catch (error) {
        console.error("error adding sample dataset", error);
        return error;
      }
    };
  },
);

export const proceedWithDbCreation = function(database) {
  return async function(dispatch, getState) {
    if (database.details["let-user-control-scheduling"]) {
      try {
        dispatch.action(VALIDATE_DATABASE_STARTED);
        const { valid } = await MetabaseApi.db_validate({ details: database });
        if (valid) {
          dispatch.action(SET_DATABASE_CREATION_STEP, {
            database: database,
            step: DB_EDIT_FORM_SCHEDULING_TAB,
          });
        } else {
          throw {
            data: {
              message: t`Couldn't connect to the database. Please check the connection details.`,
            },
          };
        }
      } catch (error) {
        dispatch.action(VALIDATE_DATABASE_FAILED, { error });
        throw error;
      }
    } else {
      // Skip the scheduling step if user doesn't need precise control over sync and scan
      await dispatch(createDatabase(database));
    }
  };
};

export const createDatabase = function(database) {
  return async function(dispatch, getState) {
    try {
      dispatch.action(CREATE_DATABASE_STARTED, {});
      const action = await dispatch(Databases.actions.create(database));
      const createdDatabase = Databases.HACK_getObjectFromAction(action);
      MetabaseAnalytics.trackEvent("Databases", "Create", database.engine);

      dispatch.action(CREATE_DATABASE);
      dispatch(push("/admin/databases?created=" + createdDatabase.id));
    } catch (error) {
      console.error("error creating a database", error);
      MetabaseAnalytics.trackEvent(
        "Databases",
        "Create Failed",
        database.engine,
      );
      throw error;
    }
  };
};

export const updateDatabase = function(database) {
  return async function(dispatch, getState) {
    try {
      dispatch.action(UPDATE_DATABASE_STARTED, { database });
      const action = await dispatch(Databases.actions.update(database));
      const savedDatabase = Databases.HACK_getObjectFromAction(action);
      MetabaseAnalytics.trackEvent("Databases", "Update", database.engine);

      dispatch.action(UPDATE_DATABASE, { database: savedDatabase });
    } catch (error) {
      MetabaseAnalytics.trackEvent(
        "Databases",
        "Update Failed",
        database.engine,
      );
      dispatch.action(UPDATE_DATABASE_FAILED, { error });
      throw error;
    }
  };
};

// NOTE Atte Keinänen 7/26/17: Original monolithic saveDatabase was broken out to smaller actions
// but `saveDatabase` action creator is still left here for keeping the interface for React components unchanged
export const saveDatabase = function(database) {
  return async function(dispatch, getState) {
    const isUnsavedDatabase = !database.id;
    if (isUnsavedDatabase) {
      await dispatch(createDatabase(database));
    } else {
      await dispatch(updateDatabase(database));
    }
  };
};

export const deleteDatabase = function(databaseId, isDetailView = true) {
  return async function(dispatch, getState) {
    try {
      dispatch.action(DELETE_DATABASE_STARTED, { databaseId });
      dispatch(push("/admin/databases/"));
      await dispatch(Databases.actions.delete({ id: databaseId }));
      MetabaseAnalytics.trackEvent(
        "Databases",
        "Delete",
        isDetailView ? "Using Detail" : "Using List",
      );
      dispatch.action(DELETE_DATABASE, { databaseId });
    } catch (error) {
      console.log("error deleting database", error);
      dispatch.action(DELETE_DATABASE_FAILED, { databaseId, error });
    }
  };
};

// syncDatabaseSchema
export const syncDatabaseSchema = createThunkAction(
  SYNC_DATABASE_SCHEMA,
  function(databaseId) {
    return async function(dispatch, getState) {
      try {
        const call = await MetabaseApi.db_sync_schema({ dbId: databaseId });
        MetabaseAnalytics.trackEvent("Databases", "Manual Sync");
        return call;
      } catch (error) {
        console.log("error syncing database", error);
      }
    };
  },
);

// rescanDatabaseFields
export const rescanDatabaseFields = createThunkAction(
  RESCAN_DATABASE_FIELDS,
  function(databaseId) {
    return async function(dispatch, getState) {
      try {
        const call = await MetabaseApi.db_rescan_values({ dbId: databaseId });
        MetabaseAnalytics.trackEvent("Databases", "Manual Sync");
        return call;
      } catch (error) {
        console.log("error syncing database", error);
      }
    };
  },
);

// discardSavedFieldValues
export const discardSavedFieldValues = createThunkAction(
  DISCARD_SAVED_FIELD_VALUES,
  function(databaseId) {
    return async function(dispatch, getState) {
      try {
        const call = await MetabaseApi.db_discard_values({ dbId: databaseId });
        MetabaseAnalytics.trackEvent("Databases", "Manual Sync");
        return call;
      } catch (error) {
        console.log("error syncing database", error);
      }
    };
  },
);

// reducers

const editingDatabase = handleActions(
  {
    [RESET]: () => null,
    [INITIALIZE_DATABASE]: (state, { payload }) => payload,
    [MIGRATE_TO_NEW_SCHEDULING_SETTINGS]: (state, { payload }) => payload,
    [UPDATE_DATABASE]: (state, { payload }) => payload.database || state,
    [DELETE_DATABASE]: (state, { payload }) => null,
    [SELECT_ENGINE]: (state, { payload }) => ({ ...state, engine: payload }),
    [SET_DATABASE_CREATION_STEP]: (state, { payload: { database } }) =>
      database,
  },
  null,
);

const deletes = handleActions(
  {
    [DELETE_DATABASE_STARTED]: (state, { payload: { databaseId } }) =>
      state.concat([databaseId]),
    [DELETE_DATABASE_FAILED]: (state, { payload: { databaseId, error } }) =>
      state.filter(dbId => dbId !== databaseId),
    [DELETE_DATABASE]: (state, { payload: { databaseId } }) =>
      state.filter(dbId => dbId !== databaseId),
  },
  [],
);

const deletionError = handleActions(
  {
    [DELETE_DATABASE_FAILED]: (state, { payload: { error } }) => error,
  },
  null,
);

const databaseCreationStep = handleActions(
  {
    [RESET]: () => DB_EDIT_FORM_CONNECTION_TAB,
    [SET_DATABASE_CREATION_STEP]: (state, { payload: { step } }) => step,
  },
  DB_EDIT_FORM_CONNECTION_TAB,
);

export default combineReducers({
  editingDatabase,
  deletionError,
  databaseCreationStep,
  deletes,
});
