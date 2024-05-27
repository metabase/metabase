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

const offset = -1;

describe("offsetClause", () => {
  describe("offset = -1", () => {
    const offset = -1;
    const stageIndex = -1;

    describe("no breakout", () => {
      const query = createQueryWithClauses({
        aggregations: [{ operatorName: "count" }],
      });
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

    describe("breakout on non-binned datetime column", () => {
      it("works", () => {
        expect("TODO").toBe("TODO");
      });

      it("gives correct name", () => {
        expect("TODO").toBe("TODO");
      });
    });

    describe("breakout on binned datetime column", () => {
      it("works", () => {
        expect("TODO").toBe("TODO");
      });

      it("gives correct name", () => {
        expect("TODO").toBe("TODO");
      });
    });

    describe("breakout on non-datetime column", () => {
      it("works", () => {
        expect("TODO").toBe("TODO");
      });

      it("gives correct name", () => {
        expect("TODO").toBe("TODO");
      });
    });
  });

  describe("offset < -1", () => {
    // const offset = -2;

    describe("no breakout", () => {
      it("works", () => {
        expect("TODO").toBe("TODO");
      });

      it("gives correct name", () => {
        expect("TODO").toBe("TODO");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      it("works", () => {
        expect("TODO").toBe("TODO");
      });

      it("gives correct name", () => {
        expect("TODO").toBe("TODO");
      });
    });

    describe("breakout on binned datetime column", () => {
      it("works", () => {
        expect("TODO").toBe("TODO");
      });

      it("gives correct name", () => {
        expect("TODO").toBe("TODO");
      });
    });

    describe("breakout on non-datetime column", () => {
      it("works", () => {
        expect("TODO").toBe("TODO");
      });

      it("gives correct name", () => {
        expect("TODO").toBe("TODO");
      });
    });
  });
});

describe("offsetClause - old", () => {
  it("generates proper name for Count aggregation with a Month breakout", () => {
    const stageIndex = -1;
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          columnName: "CREATED_AT",
          tableName: "ORDERS",
          temporalBucketName: "Month",
        },
      ],
    });
    const [aggregationClause] = aggregations(query, stageIndex);
    const offsettedClause = offsetClause(
      query,
      stageIndex,
      aggregationClause,
      offset,
    );
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    expect(
      displayInfo(finalQuery, stageIndex, offsettedClause).displayName,
    ).toBe("Count (previous month)");
  });
});

describe("diffOffsetClause", () => {
  it("offsets Count aggregation without breakout", () => {
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
