import type { Segment } from "metabase-types/api";

import { createMockStructuredDatasetQuery } from "./query";

export const createMockSegment = (opts?: Partial<Segment>): Segment => ({
  id: 1,
  name: "Segment",
  description: "A segment",
  table_id: 1,
  archived: false,
  definition: createMockStructuredDatasetQuery(),
  definition_description: "",
  created_at: "2021-01-01T00:00:00Z",
  updated_at: "2021-01-01T00:00:00Z",
  creator_id: 1,
  ...opts,
});
