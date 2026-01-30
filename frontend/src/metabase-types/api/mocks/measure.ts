import type { Measure } from "metabase-types/api";

import { createMockStructuredDatasetQuery } from "./query";

export const createMockMeasure = (opts?: Partial<Measure>): Measure => ({
  id: 1,
  name: "Measure",
  description: "A measure",
  table_id: 1,
  archived: false,
  definition: createMockStructuredDatasetQuery(),
  definition_description: "",
  created_at: "2021-01-01T00:00:00Z",
  updated_at: "2021-01-01T00:00:00Z",
  creator_id: 1,
  ...opts,
});
