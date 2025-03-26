import { push } from "react-router-redux";

import Databases from "metabase/entities/databases";
import {
  combineReducers,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";

import { editParamsForUserControlledScheduling } from "./editParamsForUserControlledScheduling";

export const ADD_SAMPLE_DATABASE =
  "metabase/admin/databases/ADD_SAMPLE_DATABASE";
export const ADD_SAMPLE_DATABASE_FAILED =
  "metabase/admin/databases/ADD_SAMPLE_DATABASE_FAILED";
export const ADDING_SAMPLE_DATABASE =
  "metabase/admin/databases/ADDING_SAMPLE_DATABASE";
export const DELETE_DATABASE = "metabase/admin/databases/DELETE_DATABASE";
export const UNPERSIST_DATABASE = "metabase/admin/databases/UNPERSIST_DATABASE";
export const DELETE_DATABASE_STARTED =
  "metabase/admin/databases/DELETE_DATABASE_STARTED";
export const DELETE_DATABASE_FAILED =
  "metabase/admin/databases/DELETE_DATABASE_FAILED";
// NOTE: some but not all of these actions have been migrated to use metabase/entities/databases

export const addSampleDatabase = createThunkAction(
  ADD_SAMPLE_DATABASE,
  function () {
    return async function (dispatch) {
      try {
        dispatch({ type: ADDING_SAMPLE_DATABASE });
        const sampleDatabase = await Databases.api.addSampleDatabase(dispatch);
        dispatch(Databases.actions.invalidateLists());
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

  return async function (dispatch) {
    try {
      const action = await dispatch(Databases.actions.create(database));
      const savedDatabase = Databases.HACK_getObjectFromAction(action);

      return savedDatabase;
    } catch (error) {
      console.error("error creating a database", error);
      throw error;
    }
  };
};

export const updateDatabase = function (database) {
  return async function (dispatch) {
    const action = await dispatch(Databases.actions.update(database));
    return Databases.HACK_getObjectFromAction(action);
  };
};

// NOTE Atte Keinänen 7/26/17: Original monolithic saveDatabase was broken out to smaller actions
// but `saveDatabase` action creator is still left here for keeping the interface for React components unchanged
export const saveDatabase = function (database) {
  return async function (dispatch) {
    const isUnsavedDatabase = !database.id;
    if (isUnsavedDatabase) {
      return await dispatch(createDatabase(database));
    } else {
      return await dispatch(updateDatabase(database));
    }
  };
};

export const deleteDatabase = function (databaseId) {
  return async function (dispatch) {
    try {
      dispatch({ type: DELETE_DATABASE_STARTED, payload: databaseId });
      await dispatch(Databases.actions.delete({ id: databaseId }));
      dispatch(push("/admin/databases/"));

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

const deletes = handleActions(
  {
    [DELETE_DATABASE_STARTED]: (state, { payload: { databaseId } }) =>
      state.concat([databaseId]),
    [DELETE_DATABASE_FAILED]: (state, { payload: { databaseId, error } }) =>
      state.filter((dbId) => dbId !== databaseId),
    [DELETE_DATABASE]: (state, { payload: { databaseId } }) =>
      state.filter((dbId) => dbId !== databaseId),
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
    [ADD_SAMPLE_DATABASE]: (state) => ({ ...state, loading: false }),
    [ADD_SAMPLE_DATABASE_FAILED]: (state, { payload: { error } }) => ({
      error,
    }),
  },
  { error: undefined, loading: false },
);

export default combineReducers({
  deletionError,
  deletes,
  sampleDatabase,
});
