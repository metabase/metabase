import type { Segment } from "metabase-types/api";

import { EMPTY_STRUCTURED_QUERY } from "./query";

export const createMockSegment = (opts?: Partial<Segment>): Segment => ({
  id: 1,
  name: "Segment",
  description: "A segment",
  table_id: 1,
  archived: false,
  definition: EMPTY_STRUCTURED_QUERY,
  definition_description: "",
  created_at: "2021-01-01T00:00:00Z",
  updated_at: "2021-01-01T00:00:00Z",
  creator_id: 1,
  ...opts,
});
