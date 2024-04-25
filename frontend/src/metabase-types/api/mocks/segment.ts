import type { Segment } from "metabase-types/api";

import { createMockStructuredQuery } from "./query";

export const createMockSegment = (opts?: Partial<Segment>): Segment => ({
  id: 1,
  name: "Segment",
  description: "A segment",
  table_id: 1,
  archived: false,
  definition: createMockStructuredQuery(),
  definition_description: "",
  ...opts,
});
