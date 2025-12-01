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
  ...opts,
});
