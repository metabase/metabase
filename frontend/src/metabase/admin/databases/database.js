import { push } from "react-router-redux";
import { createAction } from "redux-actions";
import _ from "underscore";

import { updateSetting } from "metabase/admin/settings/settings";
import { getEngines } from "metabase/databases/selectors";
import { getDefaultEngineKey } from "metabase/databases/utils/engine";
import Databases from "metabase/entities/databases";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import {
  combineReducers,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { MetabaseApi } from "metabase/services";

import { editParamsForUserControlledScheduling } from "./editParamsForUserControlledScheduling";

export const RESET = "metabase/admin/databases/RESET";
export const SELECT_ENGINE = "metabase/admin/databases/SELECT_ENGINE";
export const INITIALIZE_DATABASE =
  "metabase/admin/databases/INITIALIZE_DATABASE";
export const ADD_SAMPLE_DATABASE =
  "metabase/admin/databases/ADD_SAMPLE_DATABASE";
export const ADD_SAMPLE_DATABASE_FAILED =
  "metabase/admin/databases/ADD_SAMPLE_DATABASE_FAILED";
export const ADDING_SAMPLE_DATABASE =
  "metabase/admin/databases/ADDING_SAMPLE_DATABASE";
export const DELETE_DATABASE = "metabase/admin/databases/DELETE_DATABASE";
export const PERSIST_DATABASE = "metabase/admin/databases/PERSIST_DATABASE";
export const UNPERSIST_DATABASE = "metabase/admin/databases/UNPERSIST_DATABASE";
export const SYNC_DATABASE_SCHEMA =
  "metabase/admin/databases/SYNC_DATABASE_SCHEMA";
export const DISMISS_SYNC_SPINNER =
  "metabase/admin/databases/DISMISS_SYNC_SPINNER";
export const RESCAN_DATABASE_FIELDS =
  "metabase/admin/databases/RESCAN_DATABASE_FIELDS";
export const DISCARD_SAVED_FIELD_VALUES =
  "metabase/admin/databases/DISCARD_SAVED_FIELD_VALUES";
export const UPDATE_DATABASE = "metabase/admin/databases/UPDATE_DATABASE";
export const UPDATE_DATABASE_STARTED =
  "metabase/admin/databases/UPDATE_DATABASE_STARTED";
export const UPDATE_DATABASE_FAILED =
  "metabase/admin/databases/UPDATE_DATABASE_FAILED";
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
export const INITIALIZE_DATABASE_ERROR =
  "metabase/admin/databases/INITIALIZE_DATABASE_ERROR";
export const CLEAR_INITIALIZE_DATABASE_ERROR =
  "metabase/admin/databases/CLEAR_INITIALIZE_DATABASE_ERROR";
// NOTE: some but not all of these actions have been migrated to use metabase/entities/databases

export const CLOSE_SYNCING_MODAL =
  "metabase/admin/databases/CLOSE_SYNCING_MODAL";

export const reset = createAction(RESET);

// selectEngine (uiControl)
export const selectEngine = createAction(SELECT_ENGINE);

// Migrates old "Enable in-depth database analysis" option to new "Choose when syncs and scans happen" option
// Migration is run as a separate action because that makes it easy to track in tests
const migrateDatabaseToNewSchedulingSettings = database => {
  return async function (dispatch, getState) {
    if (database.details["let-user-control-scheduling"] == null) {
      dispatch({
        type: MIGRATE_TO_NEW_SCHEDULING_SETTINGS,
        payload: {
          ...database,
          details: {
            ...database.details,
            // if user has enabled in-depth analysis already, we will run sync&scan in default schedule anyway
            // otherwise let the user control scheduling
            "let-user-control-scheduling": !database.is_full_sync,
          },
        },
      });
    } else {
      console.error(
        `${MIGRATE_TO_NEW_SCHEDULING_SETTINGS} is no-op as scheduling settings are already set`,
      );
    }
  };
};

// initializeDatabase
export const initializeDatabase = function (databaseId) {
  return async function (dispatch, getState) {
    dispatch({ type: CLEAR_INITIALIZE_DATABASE_ERROR });

    if (databaseId) {
      try {
        const action = await dispatch(
          Databases.actions.fetch({ id: databaseId }, { reload: true }),
        );
        const database = Databases.HACK_getObjectFromAction(action);
        dispatch({ type: INITIALIZE_DATABASE, payload: database });

        // If the new scheduling toggle isn't set, run the migration
        if (database.details["let-user-control-scheduling"] == null) {
          dispatch(migrateDatabaseToNewSchedulingSettings(database));
        }
      } catch (error) {
        console.error("error fetching database", databaseId, error);
        dispatch({ type: INITIALIZE_DATABASE_ERROR, payload: error });
      }
    } else {
      const engines = getEngines(getState());
      const newDatabase = {
        name: "",
        auto_run_queries: true,
        engine: getDefaultEngineKey(engines),
        details: {},
        created: false,
      };
      dispatch({ type: INITIALIZE_DATABASE, payload: newDatabase });
    }
  };
};

export const addSampleDatabase = createThunkAction(
  ADD_SAMPLE_DATABASE,
  function (query) {
    return async function (dispatch, getState) {
      try {
        dispatch({ type: ADDING_SAMPLE_DATABASE });
        const sampleDatabase = await MetabaseApi.db_add_sample_database();
        dispatch(Databases.actions.invalidateLists());
        MetabaseAnalytics.trackStructEvent("Databases", "Add Sample Data");
        return sampleDatabase;
      } catch (error) {
        console.error("error adding sample database", error);
        dispatch({ type: ADD_SAMPLE_DATABASE_FAILED, payload: error });
        return error;
      }
    };
  },
);

export const createDatabase = function (database) {
  editParamsForUserControlledScheduling(database);

  return async function (dispatch, getState) {
    try {
      dispatch({ type: CREATE_DATABASE_STARTED });
      const action = await dispatch(Databases.actions.create(database));
      const savedDatabase = Databases.HACK_getObjectFromAction(action);
      MetabaseAnalytics.trackStructEvent(
        "Databases",
        "Create",
        database.engine,
      );

      dispatch({ type: CREATE_DATABASE });

      return savedDatabase;
    } catch (error) {
      console.error("error creating a database", error);
      MetabaseAnalytics.trackStructEvent(
        "Databases",
        "Create Failed",
        database.engine,
      );
      throw error;
    }
  };
};

export const updateDatabase = function (database) {
  return async function (dispatch, getState) {
    try {
      dispatch({ type: UPDATE_DATABASE_STARTED, payload: { database } });
      const action = await dispatch(Databases.actions.update(database));
      const savedDatabase = Databases.HACK_getObjectFromAction(action);
      MetabaseAnalytics.trackStructEvent(
        "Databases",
        "Update",
        database.engine,
      );

      dispatch({ type: UPDATE_DATABASE, payload: { database: savedDatabase } });
      return savedDatabase;
    } catch (error) {
      MetabaseAnalytics.trackStructEvent(
        "Databases",
        "Update Failed",
        database.engine,
      );
      dispatch({ type: UPDATE_DATABASE_FAILED, payload: { error } });
      throw error;
    }
  };
};

// NOTE Atte Keinänen 7/26/17: Original monolithic saveDatabase was broken out to smaller actions
// but `saveDatabase` action creator is still left here for keeping the interface for React components unchanged
export const saveDatabase = function (database) {
  return async function (dispatch, getState) {
    const isUnsavedDatabase = !database.id;
    if (isUnsavedDatabase) {
      return await dispatch(createDatabase(database));
    } else {
      return await dispatch(updateDatabase(database));
    }
  };
};

export const deleteDatabase = function (databaseId, isDetailView = true) {
  return async function (dispatch, getState) {
    try {
      dispatch({ type: DELETE_DATABASE_STARTED, payload: databaseId });
      await dispatch(Databases.actions.delete({ id: databaseId }));
      dispatch(push("/admin/databases/"));
      MetabaseAnalytics.trackStructEvent(
        "Databases",
        "Delete",
        isDetailView ? "Using Detail" : "Using List",
      );
      dispatch({ type: DELETE_DATABASE, payload: { databaseId } });
    } catch (error) {
      console.error("error deleting database", error);
      dispatch({
        type: DELETE_DATABASE_FAILED,
        payload: { databaseId, error },
      });
    }
  };
};

export const dismissSyncSpinner = createThunkAction(
  DISMISS_SYNC_SPINNER,
  function (databaseId) {
    return async function (dispatch, getState) {
      try {
        await MetabaseApi.db_dismiss_sync_spinner({ dbId: databaseId });
      } catch (error) {
        console.error("error dismissing sync spinner for database", error);
      }
    };
  },
);

export const closeSyncingModal = createThunkAction(
  CLOSE_SYNCING_MODAL,
  function () {
    return async function (dispatch) {
      const setting = { key: "show-database-syncing-modal", value: false };
      await dispatch(updateSetting(setting));
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
    [PERSIST_DATABASE]: (state, { error }) => {
      if (error) {
        return state;
      }
      return {
        ...state,
        features: [...state.features, "persist-models-enabled"],
      };
    },
    [UNPERSIST_DATABASE]: (state, { error }) => {
      if (error) {
        return state;
      }
      return {
        ...state,
        features: _.without(state.features, "persist-models-enabled"),
      };
    },
  },
  null,
);

const initializeError = handleActions(
  {
    [INITIALIZE_DATABASE_ERROR]: (state, { payload }) => payload,
    [CLEAR_INITIALIZE_DATABASE_ERROR]: () => null,
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

const sampleDatabase = handleActions(
  {
    [ADDING_SAMPLE_DATABASE]: () => ({ loading: true }),
    [ADD_SAMPLE_DATABASE]: state => ({ ...state, loading: false }),
    [ADD_SAMPLE_DATABASE_FAILED]: (state, { payload: { error } }) => ({
      error,
    }),
  },
  { error: undefined, loading: false },
);

export default combineReducers({
  editingDatabase,
  initializeError,
  deletionError,
  deletes,
  sampleDatabase,
});
