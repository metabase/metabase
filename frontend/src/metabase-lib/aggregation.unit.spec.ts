import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { offsetClause, aggregations } from "./aggregation";
import { toLegacyQuery } from "./query";
import { SAMPLE_DATABASE, createQueryWithClauses } from "./test-helpers";

const offset = -1;

describe("aggregation", () => {
  describe("offsetClause", () => {
    it("offsets Count aggregation", () => {
      const stageIndex = -1;
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
      });
      const [aggregationClause] = aggregations(query, stageIndex);

      const finalQuery = offsetClause(
        query,
        stageIndex,
        aggregationClause,
        offset,
      );

      expect(toLegacyQuery(finalQuery)).toMatchObject({
        database: SAMPLE_DATABASE.id,
        query: {
          aggregation: [
            ["count"],
            [
              "offset",
              {
                name: "Count (previous period)",
                "display-name": "Count (previous period)",
              },
              ["count"],
              offset,
            ],
          ],
          "source-table": ORDERS_ID,
        },
        type: "query",
      });
    });
  });
});
