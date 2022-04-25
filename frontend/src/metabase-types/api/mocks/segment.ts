import { ISegment } from "metabase-types/api";
import { PRODUCTS } from "__support__/sample_database_fixture";

export function createMockSegment(opts?: Partial<ISegment>): ISegment {
  return {
    id: 1,
    name: "Gizmos",
    archived: false,
    table_id: PRODUCTS.id,
    description: "Gizmos gizmos gizmos",
    definition: {
      "source-table": PRODUCTS.id,
      aggregation: [["count"]],
      filter: ["=", ["field", PRODUCTS.CATEGORY.id, null], "Gizmo"],
    },
    created_at: "2022-04-25T14:08:29.638",
    updated_at: "2022-04-25T14:08:29.638",
    creator_id: 1,
    ...opts,
  };
}
