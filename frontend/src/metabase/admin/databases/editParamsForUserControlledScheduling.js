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
<<<<<<< HEAD
  const { details, schedules = {} } = database;

  if (details["let-user-control-scheduling"] && !schedules.metadata_sync) {
=======
  const { details, schedules } = database;

  if (details["let-user-control-scheduling"] && !schedules?.metadata_sync) {
>>>>>>> tags/v0.41.0
    database.schedules.metadata_sync = {
      schedule_type: "daily",
    };
  }
}
