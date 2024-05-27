import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { aggregate, aggregations } from "./aggregation";
import {
  offsetClause,
  diffOffsetClause,
  percentDiffOffsetClause,
} from "./expression";
import { displayInfo } from "./metadata";
import { toLegacyQuery } from "./query";
import { SAMPLE_DATABASE, createQueryWithClauses } from "./test-helpers";

const baseQuery = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
});

describe("offsetClause", () => {
  const stageIndex = -1;

  describe("offset = -1", () => {
    const offset = -1;

    describe("no breakout", () => {
      const query = baseQuery;
      const [clause] = aggregations(query, stageIndex);
      const offsettedClause = offsetClause(query, stageIndex, clause, offset);
      const finalQuery = aggregate(query, stageIndex, offsettedClause);

      it("produces correct aggregation name", () => {
        const info = displayInfo(finalQuery, stageIndex, offsettedClause);
        expect(info.displayName).toBe("Count (previous period)");
      });

      it("produces correct aggregation clause", () => {
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

    describe("breakout on binned datetime column", () => {
      const query = createQueryWithClauses({
        query: baseQuery,
        breakouts: [
          {
            columnName: "CREATED_AT",
            tableName: "ORDERS",
            temporalBucketName: "Month",
          },
        ],
      });
      const [clause] = aggregations(query, stageIndex);
      const offsettedClause = offsetClause(query, stageIndex, clause, offset);
      const finalQuery = aggregate(query, stageIndex, offsettedClause);

      it("produces correct aggregation name", () => {
        const info = displayInfo(finalQuery, stageIndex, offsettedClause);
        expect(info.displayName).toBe("Count (previous month)");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      const query = createQueryWithClauses({
        query: baseQuery,
        breakouts: [
          {
            columnName: "CREATED_AT",
            tableName: "ORDERS",
          },
        ],
      });
      const [clause] = aggregations(query, stageIndex);
      const offsettedClause = offsetClause(query, stageIndex, clause, offset);
      const finalQuery = aggregate(query, stageIndex, offsettedClause);

      it("produces correct aggregation name", () => {
        const info = displayInfo(finalQuery, stageIndex, offsettedClause);
        expect(info.displayName).toBe("Count (previous period)");
      });
    });

    describe("breakout on non-datetime column", () => {
      const query = createQueryWithClauses({
        query: baseQuery,
        breakouts: [
          {
            columnName: "CATEGORY",
            tableName: "PRODUCTS",
          },
        ],
      });
      const [clause] = aggregations(query, stageIndex);
      const offsettedClause = offsetClause(query, stageIndex, clause, offset);
      const finalQuery = aggregate(query, stageIndex, offsettedClause);

      it("produces correct aggregation name", () => {
        const info = displayInfo(finalQuery, stageIndex, offsettedClause);
        expect(info.displayName).toBe("Count (previous value)");
      });
    });
  });

  describe.skip("offset < -1", () => {
    const offset = -2;

    describe("no breakout", () => {
      const query = baseQuery;
      const [clause] = aggregations(query, stageIndex);
      const offsettedClause = offsetClause(query, stageIndex, clause, offset);
      const finalQuery = aggregate(query, stageIndex, offsettedClause);

      it("produces correct aggregation name", () => {
        const info = displayInfo(finalQuery, stageIndex, offsettedClause);
        expect(info.displayName).toBe("Count (2 periods ago)");
      });
    });

    describe("breakout on binned datetime column", () => {
      it("produces correct aggregation name", () => {
        expect("TODO").toBe("TODO");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      it("produces correct aggregation name", () => {
        expect("TODO").toBe("TODO");
      });
    });

    describe("breakout on non-datetime column", () => {
      it("produces correct aggregation name", () => {
        expect("TODO").toBe("TODO");
      });
    });
  });
});

describe("diffOffsetClause", () => {
  it("offsets Count aggregation without breakout", () => {
    const offset = -1;
    const stageIndex = -1;
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });
    const [aggregationClause] = aggregations(query, stageIndex);
    const offsettedClause = diffOffsetClause(
      query,
      stageIndex,
      aggregationClause,
      offset,
    );
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    // TODO: displayInfo's name assertion

    expect(toLegacyQuery(finalQuery)).toMatchObject({
      database: SAMPLE_DATABASE.id,
      query: {
        aggregation: [
          ["count"],
          [
            "-",
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
        ],
        "source-table": ORDERS_ID,
      },
      type: "query",
    });
  });

  // TODO: test for name
});

describe("percentDiffOffsetClause", () => {
  it("offsets Count aggregation without breakout", () => {
    const offset = -1;
    const stageIndex = -1;
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });
    const [aggregationClause] = aggregations(query, stageIndex);
    const offsettedClause = percentDiffOffsetClause(
      query,
      stageIndex,
      aggregationClause,
      offset,
    );
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    // TODO: displayInfo's name assertion

    expect(toLegacyQuery(finalQuery)).toMatchObject({
      database: SAMPLE_DATABASE.id,
      query: {
        aggregation: [
          ["count"],
          [
            "-",
            [
              "/",
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
            1,
          ],
        ],
        "source-table": ORDERS_ID,
      },
      type: "query",
    });
  });

  // TODO: test for name
});
