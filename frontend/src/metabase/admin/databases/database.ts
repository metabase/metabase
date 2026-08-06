import { createAction, createReducer } from "@reduxjs/toolkit";

import { databaseApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { combineReducers } from "metabase/redux";
import { createDatabase } from "metabase/redux/databases";
import { updateMetadata } from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
import { navigate } from "metabase/router";
import { DatabaseSchema } from "metabase/schema";
import type {
  DatabaseData,
  DatabaseId,
  UpdateDatabaseRequest,
} from "metabase-types/api";

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

export const updateDatabase = function (
  database: { id: DatabaseId } & Partial<DatabaseData>,
) {
  return async function (dispatch: Dispatch) {
    const request: UpdateDatabaseRequest = {
      id: database.id,
      name: database.name,
      engine: database.engine,
      refingerprint: database.refingerprint,
      details: database.details,
      write_data_details: database.write_data_details,
      is_full_sync: database.is_full_sync,
      is_on_demand: database.is_on_demand,
      schedules: database.schedules,
      auto_run_queries: database.auto_run_queries ?? undefined,
      cache_ttl: database.cache_ttl,
      provider_name: database.provider_name,
      settings: database.settings,
    };
    const result = await runRtkEndpoint(
      request,
      dispatch,
      databaseApi.endpoints.updateDatabase,
    );
    dispatch(updateMetadata(result, DatabaseSchema));
    return result;
  };
};

export const saveDatabase = function (database: DatabaseData) {
  return async function (dispatch: Dispatch) {
    const id = database.id;
    if (id == null) {
      return await dispatch(createDatabase(database));
    } else {
      return await dispatch(updateDatabase({ ...database, id }));
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
      navigate("/admin/databases/");

      dispatch(DELETE_DATABASE({ databaseId }));
    } catch (error) {
      console.error("error deleting database", error);
      dispatch(DELETE_DATABASE_FAILED({ databaseId, error }));
    }
  };
};

export const databasesReducer = combineReducers({
  deletionError: createReducer<null | unknown>(null, (builder) => {
    builder.addCase(
      DELETE_DATABASE_FAILED,
      (_state, action) => action.payload.error,
    );
  }),
  // Unjustified type cast. FIXME
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
