import { IMetric } from "metabase-types/api";
import {
  PRODUCTS,
  SAMPLE_DATABASE_ID,
} from "__support__/sample_database_fixture";

export function createMockMetric(opts?: Partial<IMetric>): IMetric {
  return {
    id: 1,
    name: "Avg of Product Rating",
    archived: false,
    table_id: PRODUCTS.id,
    database_id: SAMPLE_DATABASE_ID,
    description: "This is an average",
    definition: {
      "source-table": PRODUCTS.id,
      aggregation: [["avg", ["field", PRODUCTS.RATING.id, null]]],
    },
    created_at: "2022-04-25T14:08:29.638",
    updated_at: "2022-04-25T14:08:29.638",
    creator_id: 1,
    ...opts,
  };
}
