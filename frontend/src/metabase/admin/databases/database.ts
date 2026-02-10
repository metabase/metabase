import { createAction, createReducer } from "@reduxjs/toolkit";
import { push } from "react-router-redux";

import { Databases } from "metabase/entities/databases";
import { combineReducers } from "metabase/lib/redux";
import type { DatabaseData, DatabaseId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { editParamsForUserControlledScheduling } from "./editParamsForUserControlledScheduling";

const DELETE_DATABASE = createAction<{ databaseId: DatabaseId }>(
  "metabase/admin/databases/DELETE_DATABASE",
);
const DELETE_DATABASE_STARTED = createAction<{ databaseId: DatabaseId }>(
  "metabase/admin/databases/DELETE_DATABASE_STARTED",
);
const DELETE_DATABASE_FAILED = createAction<{
  databaseId: DatabaseId;
  error: unknown;
}>("metabase/admin/databases/DELETE_DATABASE_FAILED");

export const createDatabase = function (inputDatabase: DatabaseData) {
  const database = editParamsForUserControlledScheduling(inputDatabase);

  return async function (dispatch: Dispatch) {
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

export const updateDatabase = function (database: DatabaseData) {
  return async function (dispatch: Dispatch) {
    const action = await dispatch(Databases.actions.update(database));
    return Databases.HACK_getObjectFromAction(action);
  };
};

export const saveDatabase = function (database: DatabaseData) {
  return async function (dispatch: Dispatch) {
    const isUnsavedDatabase = !database.id;
    if (isUnsavedDatabase) {
      return await dispatch(createDatabase(database));
    } else {
      return await dispatch(updateDatabase(database));
    }
  };
};

export const deleteDatabase = function (databaseId: DatabaseId) {
  return async function (dispatch: Dispatch) {
    try {
      dispatch(DELETE_DATABASE_STARTED({ databaseId }));
      await dispatch(Databases.actions.delete({ id: databaseId }));
      dispatch(push("/admin/databases/"));

      dispatch(DELETE_DATABASE({ databaseId }));
    } catch (error) {
      console.error("error deleting database", error);
      dispatch(DELETE_DATABASE_FAILED({ databaseId, error }));
    }
  };
};

export const databasesReducer = combineReducers({
  deletionError: createReducer(null as null | unknown, (builder) => {
    builder.addCase(
      DELETE_DATABASE_FAILED,
      (_state, action) => action.payload.error,
    );
  }),
  deletes: createReducer([] as DatabaseId[], (builder) => {
    builder
      .addCase(DELETE_DATABASE_STARTED, (state, action) =>
        state.concat([action.payload.databaseId]),
      )
      .addCase(DELETE_DATABASE_FAILED, (state, action) =>
        state.filter((dbId) => dbId !== action.payload.databaseId),
      )
      .addCase(DELETE_DATABASE, (state, action) =>
        state.filter((dbId) => dbId !== action.payload.databaseId),
      );
  }),
});
