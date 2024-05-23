import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { aggregateOffset, aggregations } from "./aggregation";
import { toLegacyQuery } from "./query";
import { SAMPLE_DATABASE, createQueryWithClauses } from "./test-helpers";

const offset = -1;
const name = "asd";

describe("aggregation", () => {
  it("works", () => {
    const stageIndex = -1;
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });
    const [aggregationClause] = aggregations(query, stageIndex);

    const finalQuery = aggregateOffset(
      query,
      stageIndex,
      aggregationClause,
      // offset, // TODO: pass this as an argument
    );

    expect(toLegacyQuery(finalQuery)).toEqual({
      database: SAMPLE_DATABASE.id,
      query: {
        aggregation: [
          ["count"],
          ["offset", createOffsetOptions(name), ["count"], offset],
        ],
        "source-table": ORDERS_ID,
      },
      type: "query",
    });
  });
});

function createOffsetOptions(name = "offset") {
  return {
    "lib/uuid": "af9c4d6d-dc77-49bb-9902-f769c9c6945c",
    name,
    "display-name": name,
  };
}
