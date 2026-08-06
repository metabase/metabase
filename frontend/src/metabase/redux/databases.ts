import _ from "underscore";

import { databaseApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { updateMetadata } from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
import { DatabaseSchema } from "metabase/schema";
import type { CreateDatabaseRequest, DatabaseData } from "metabase-types/api";

export const editParamsForUserControlledScheduling = _.compose(
  editScheduleParamsForUserControlledScheduling,
  editSyncParamsForUserControlledScheduling,
);

function editSyncParamsForUserControlledScheduling(
  database: DatabaseData,
): DatabaseData {
  if (database.details?.["let-user-control-scheduling"]) {
    return { ...database, is_full_sync: false };
  } else {
    return database;
  }
}

function editScheduleParamsForUserControlledScheduling(
  database: DatabaseData,
): DatabaseData {
  const { details, schedules } = database;

  if (details?.["let-user-control-scheduling"] && !schedules?.metadata_sync) {
    return {
      ...database,
      schedules: {
        ...database.schedules,
        metadata_sync: { schedule_type: "daily" },
      },
    };
  } else {
    return database;
  }
}

export const createDatabase = function (inputDatabase: DatabaseData) {
  const database = editParamsForUserControlledScheduling(inputDatabase);

  const request: CreateDatabaseRequest = {
    name: database.name,
    engine: database.engine ?? "",
    details: database.details ?? {},
    is_full_sync: database.is_full_sync,
    is_on_demand: database.is_on_demand,
    schedules: database.schedules,
    auto_run_queries: database.auto_run_queries ?? undefined,
    cache_ttl: database.cache_ttl ?? undefined,
    provider_name: database.provider_name,
  };

  return async function (dispatch: Dispatch) {
    try {
      const savedDatabase = await runRtkEndpoint(
        request,
        dispatch,
        databaseApi.endpoints.createDatabase,
      );
      dispatch(updateMetadata(savedDatabase, DatabaseSchema));
      return savedDatabase;
    } catch (error) {
      console.error("error creating a database", error);
      throw error;
    }
  };
};
