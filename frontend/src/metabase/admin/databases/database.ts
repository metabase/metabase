import { createAction, createReducer } from "@reduxjs/toolkit";
import { push } from "react-router-redux";

import { databaseApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { combineReducers } from "metabase/redux";
import { createDatabase } from "metabase/redux/databases";
import { updateMetadata } from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
import { DatabaseSchema } from "metabase/schema";
import type { DatabaseData, DatabaseId } from "metabase-types/api";

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

export const updateDatabase = function (database: DatabaseData) {
  return async function (dispatch: Dispatch) {
    const result = await runRtkEndpoint(
      database,
      dispatch,
      databaseApi.endpoints.updateDatabase,
    );
    dispatch(updateMetadata(result, DatabaseSchema));
    return result;
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
      await runRtkEndpoint(
        databaseId,
        dispatch,
        databaseApi.endpoints.deleteDatabase,
      );
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
