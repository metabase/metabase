import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { aggregate, aggregations } from "./aggregation";
import { offsetClause } from "./expression";
import { displayInfo } from "./metadata";
import { toLegacyQuery } from "./query";
import { SAMPLE_DATABASE, createQueryWithClauses } from "./test-helpers";

const offset = -1;

describe("expression", () => {
  describe("offsetClause", () => {
    it("offsets Count aggregation", () => {
      const stageIndex = -1;
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
      });
      const [aggregationClause] = aggregations(query, stageIndex);
      const ofsettedClause = offsetClause(
        query,
        stageIndex,
        aggregationClause,
        offset,
      );
      const finalQuery = aggregate(query, stageIndex, ofsettedClause);
      const expectedOffsettedClauseName = "Count (previous period)";

      expect(displayInfo(finalQuery, stageIndex, ofsettedClause)).toEqual({
        displayName: expectedOffsettedClauseName,
        effectiveType: "type/Integer",
        isNamed: true,
        longDisplayName: expectedOffsettedClauseName,
        name: expectedOffsettedClauseName,
      });

      expect(toLegacyQuery(finalQuery)).toMatchObject({
        database: SAMPLE_DATABASE.id,
        query: {
          aggregation: [
            ["count"],
            [
              "offset",
              {
                name: expectedOffsettedClauseName,
                "display-name": expectedOffsettedClauseName,
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
