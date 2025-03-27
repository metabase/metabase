import _ from "underscore";

import type { Database } from "metabase-types/api";

export const editParamsForUserControlledScheduling = _.compose(
  editScheduleParamsForUserControlledScheduling,
  editSyncParamsForUserControlledScheduling,
);

function editSyncParamsForUserControlledScheduling(
  database: Database,
): Database {
  if (database.details?.["let-user-control-scheduling"]) {
    return { ...database, is_full_sync: false };
  } else {
    return database;
  }
}

function editScheduleParamsForUserControlledScheduling(
  database: Database,
): Database {
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
