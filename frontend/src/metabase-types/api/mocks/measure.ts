import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Measure } from "metabase-types/api";

export const createMockMeasure = (opts?: Partial<Measure>): Measure => ({
  id: 1,
  name: "Measure",
  description: "A measure",
  table_id: 1,
  archived: false,
  definition: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: {
            type: "table",
            id: 1,
          },
        },
      ],
    }),
  ),
  definition_description: "",
  created_at: "2021-01-01T00:00:00Z",
  updated_at: "2021-01-01T00:00:00Z",
  creator_id: 1,
  ...opts,
});
