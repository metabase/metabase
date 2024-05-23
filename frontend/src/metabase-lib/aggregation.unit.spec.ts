import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { offsetClause, aggregations } from "./aggregation";
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

    const finalQuery = offsetClause(
      query,
      stageIndex,
      aggregationClause,
      name,
      offset,
    );

    expect(toLegacyQuery(finalQuery)).toMatchObject({
      database: SAMPLE_DATABASE.id,
      query: {
        aggregation: [
          ["count"],
          ["offset", { name, "display-name": name }, ["count"], offset],
        ],
        "source-table": ORDERS_ID,
      },
      type: "query",
    });
  });
});
