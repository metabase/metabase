import { editParamsForUserControlledScheduling } from "./editParamsForUserControlledScheduling";

it("adds full_sync param if user will control scheduling", () => {
  const database = {
    schedules: {},
    details: { "let-user-control-scheduling": true },
  };

  editParamsForUserControlledScheduling(database);

  expect(database.is_full_sync).toBe(false);
});

it("does not add full_sync param if user will not control scheduling", () => {
  const database = {
    schedules: {},
    details: {},
  };

  editParamsForUserControlledScheduling(database);

  expect(database.is_full_sync).toBe(undefined);
});

it("adds metadata_sync param if user will control scheduling and no metadata_sync data is present", () => {
  const database = {
    schedules: {},
    details: { "let-user-control-scheduling": true },
  };

  editParamsForUserControlledScheduling(database);

  expect(database.schedules.metadata_sync.schedule_type).toBe("daily");
});

it("does not add metadata_sync param if user will not control scheduling", () => {
  const database = {
    schedules: {},
    details: {},
  };

  editParamsForUserControlledScheduling(database);

  expect(database.schedules).toStrictEqual({});
});

it("does not add metadata_sync param if user will control scheduling and metadata_sync data is present", () => {
  const database = {
    schedules: { metadata_sync: { schedule_type: "hourly" } },
    details: { "let-user-control-scheduling": true },
  };

  editParamsForUserControlledScheduling(database);

  expect(database.schedules.metadata_sync.schedule_type).toBe("hourly");
});
