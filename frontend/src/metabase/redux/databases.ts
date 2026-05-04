import _ from "underscore";

import { Databases } from "metabase/entities/databases";
import type { Dispatch } from "metabase/redux/store";
import type { DatabaseData } from "metabase-types/api";

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
