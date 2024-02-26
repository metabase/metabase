import type { Metric } from "metabase-types/api";

import { createMockStructuredQuery } from "./query";

export const createMockMetric = (opts?: Partial<Metric>): Metric => ({
  id: 1,
  name: "Metric",
  description: "A metric",
  table_id: 1,
  archived: false,
  definition: createMockStructuredQuery(),
  ...opts,
});
