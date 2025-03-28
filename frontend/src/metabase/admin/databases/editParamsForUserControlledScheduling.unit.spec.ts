import { createMockDatabase } from "metabase-types/api/mocks";

import { editParamsForUserControlledScheduling } from "./editParamsForUserControlledScheduling";

it("adds full_sync param if user will control scheduling", () => {
  const inputDatabase = createMockDatabase({
    schedules: {},
    details: { "let-user-control-scheduling": true },
  });

  const database = editParamsForUserControlledScheduling(inputDatabase);

  expect(database.is_full_sync).toBe(false);
});

it("does not add full_sync param if user will not control scheduling", () => {
  const inputDatabase = createMockDatabase({
    schedules: {},
    details: {},
    is_full_sync: undefined,
  });

  const database = editParamsForUserControlledScheduling(inputDatabase);

  expect(database.is_full_sync).toBe(undefined);
});

it("adds metadata_sync param if user will control scheduling and no metadata_sync data is present", () => {
  const inputDatabase = createMockDatabase({
    schedules: {},
    details: { "let-user-control-scheduling": true },
  });

  const database = editParamsForUserControlledScheduling(inputDatabase);

  expect(database.schedules.metadata_sync?.schedule_type).toBe("daily");
});

it("does not add metadata_sync param if user will not control scheduling", () => {
  const inputDatabase = createMockDatabase({
    schedules: {},
    details: {},
  });

  const database = editParamsForUserControlledScheduling(inputDatabase);

  expect(database.schedules).toStrictEqual({});
});

it("does not add metadata_sync param if user will control scheduling and metadata_sync data is present", () => {
  const inputDatabase = createMockDatabase({
    schedules: { metadata_sync: { schedule_type: "hourly" } },
    details: { "let-user-control-scheduling": true },
  });

  const database = editParamsForUserControlledScheduling(inputDatabase);

  expect(database.schedules.metadata_sync?.schedule_type).toBe("hourly");
});
