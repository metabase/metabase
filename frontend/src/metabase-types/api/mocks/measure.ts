import type { Measure, OpaqueDatasetQuery } from "metabase-types/api";

export const createMockMeasure = (opts?: Partial<Measure>): Measure => ({
  id: 1,
  name: "Measure",
  description: "A measure",
  table_id: 1,
  archived: false,
  // HACK: we cannot create a valid OpaqueDatasetQuery here since that would
  // lead to cyclic imports in metabase-types/api/mocks.
  //
  // Most unit tests don't rely on the definition of the measure and the ones that do
  // can override the definition with a valid OpaqueDatasetQuery.
  definition: {} as unknown as OpaqueDatasetQuery,
  definition_description: "",
  created_at: "2021-01-01T00:00:00Z",
  updated_at: "2021-01-01T00:00:00Z",
  creator_id: 1,
  ...opts,
});
