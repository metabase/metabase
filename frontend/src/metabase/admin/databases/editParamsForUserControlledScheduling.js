export function editParamsForUserControlledScheduling(database) {
  editSyncParamsForUserControlledScheduling(database);
  editScheduleParamsForUserControlledScheduling(database);
}

function editSyncParamsForUserControlledScheduling(database) {
  if (database.details["let-user-control-scheduling"]) {
    database.is_full_sync = false;
  }
}

function editScheduleParamsForUserControlledScheduling(database) {
  const { details, schedules } = database;

  if (details["let-user-control-scheduling"] && !schedules?.metadata_sync) {
    database.schedules.metadata_sync = {
      schedule_type: "daily",
    };
  }
}
