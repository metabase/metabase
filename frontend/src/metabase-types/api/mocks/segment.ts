import { STRUCTURED_QUERY_TEMPLATE } from "metabase-lib/v1/queries/templates";
import type { Segment } from "metabase-types/api";

export const createMockSegment = (opts?: Partial<Segment>): Segment => ({
  id: 1,
  name: "Segment",
  description: "A segment",
  table_id: 1,
  archived: false,
  definition: STRUCTURED_QUERY_TEMPLATE,
  definition_description: "",
  created_at: "2021-01-01T00:00:00Z",
  updated_at: "2021-01-01T00:00:00Z",
  creator_id: 1,
  ...opts,
});
