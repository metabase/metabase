import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { aggregate, aggregations } from "./aggregation";
import { displayInfo } from "./metadata";
import {
  diffOffsetClause,
  offsetClause,
  percentDiffOffsetClause,
} from "./offset";
import { toLegacyQuery } from "./query";
import { SAMPLE_DATABASE, createQueryWithClauses } from "./test-helpers";
import type { Query } from "./types";

const stageIndex = -1;

const queryNoBreakout = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
});

const queryDateBreakoutNoBinning = createQueryWithClauses({
  query: queryNoBreakout,
  breakouts: [
    {
      columnName: "CREATED_AT",
      tableName: "ORDERS",
    },
  ],
});

const queryDateBreakoutBinning = createQueryWithClauses({
  query: queryNoBreakout,
  breakouts: [
    {
      columnName: "CREATED_AT",
      tableName: "ORDERS",
      temporalBucketName: "Month",
    },
  ],
});

const queryCategoryBreakout = createQueryWithClauses({
  query: queryNoBreakout,
  breakouts: [
    {
      columnName: "CATEGORY",
      tableName: "PRODUCTS",
    },
  ],
});

describe("offsetClause", () => {
  const setup = (query: Query, offset: number) => {
    const [clause] = aggregations(query, stageIndex);
    const offsettedClause = offsetClause(query, stageIndex, clause, offset);
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    return {
      clause: offsettedClause,
      query: finalQuery,
    };
  };

  describe("offset = -1", () => {
    const offset = -1;

    describe("no breakout", () => {
      const { query, clause } = setup(queryNoBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (previous period)");
      });

      it("produces correct aggregation clause", () => {
        expect(toLegacyQuery(query)).toMatchObject({
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
      const { query, clause } = setup(queryDateBreakoutBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (previous month)");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutNoBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (previous period)");
      });
    });

    describe("breakout on non-datetime column", () => {
      const { query, clause } = setup(queryCategoryBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (previous value)");
      });
    });
  });

  describe("offset < -1", () => {
    const offset = -2;

    describe("no breakout", () => {
      const { query, clause } = setup(queryNoBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (2 periods ago)");
      });
    });

    describe("breakout on binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (2 months ago)");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutNoBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (2 periods ago)");
      });
    });

    describe("breakout on non-datetime column", () => {
      const { query, clause } = setup(queryCategoryBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (2 rows above)");
      });
    });
  });
});

describe("diffOffsetClause", () => {
  const setup = (query: Query, offset: number) => {
    const [clause] = aggregations(query, stageIndex);
    const offsettedClause = diffOffsetClause(query, stageIndex, clause, offset);
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    return {
      clause: offsettedClause,
      query: finalQuery,
    };
  };

  describe("offset = -1", () => {
    const offset = -1;

    describe("no breakout", () => {
      const { query, clause } = setup(queryNoBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs previous period)");
      });

      it("produces correct aggregation clause", () => {
        expect(toLegacyQuery(query)).toMatchObject({
          database: SAMPLE_DATABASE.id,
          query: {
            aggregation: [
              ["count"],
              [
                "aggregation-options",
                ["-", ["count"], ["offset", {}, ["count"], offset]],
                {
                  name: "Count (vs previous period)",
                  "display-name": "Count (vs previous period)",
                },
              ],
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        });
      });
    });

    describe("breakout on binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs previous month)");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutNoBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs previous period)");
      });
    });

    describe("breakout on non-datetime column", () => {
      const { query, clause } = setup(queryCategoryBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs previous value)");
      });
    });
  });

  describe("offset < -1", () => {
    const offset = -2;

    describe("no breakout", () => {
      const { query, clause } = setup(queryNoBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs 2 periods ago)");
      });
    });

    describe("breakout on binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs 2 months ago)");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutNoBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs 2 periods ago)");
      });
    });

    describe("breakout on non-datetime column", () => {
      const { query, clause } = setup(queryCategoryBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (vs 2 rows above)");
      });
    });
  });
});

describe("percentDiffOffsetClause", () => {
  const setup = (query: Query, offset: number) => {
    const [clause] = aggregations(query, stageIndex);
    const offsettedClause = percentDiffOffsetClause(
      query,
      stageIndex,
      clause,
      offset,
    );
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    return {
      clause: offsettedClause,
      query: finalQuery,
    };
  };

  describe("offset = -1", () => {
    const offset = -1;

    describe("no breakout", () => {
      const { query, clause } = setup(queryNoBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs previous period)");
      });

      it("produces correct aggregation clause", () => {
        expect(toLegacyQuery(query)).toMatchObject({
          database: SAMPLE_DATABASE.id,
          query: {
            aggregation: [
              ["count"],
              [
                "aggregation-options",
                ["-", ["/", ["count"], ["offset", {}, ["count"], offset]], 1],
                {
                  name: "Count (% vs previous period)",
                  "display-name": "Count (% vs previous period)",
                },
              ],
            ],
            "source-table": ORDERS_ID,
          },
          type: "query",
        });
      });
    });

    describe("breakout on binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs previous month)");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutNoBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs previous period)");
      });
    });

    describe("breakout on non-datetime column", () => {
      const { query, clause } = setup(queryCategoryBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs previous value)");
      });
    });
  });

  describe("offset < -1", () => {
    const offset = -2;

    describe("no breakout", () => {
      const { query, clause } = setup(queryNoBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs 2 periods ago)");
      });
    });

    describe("breakout on binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs 2 months ago)");
      });
    });

    describe("breakout on non-binned datetime column", () => {
      const { query, clause } = setup(queryDateBreakoutNoBinning, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs 2 periods ago)");
      });
    });

    describe("breakout on non-datetime column", () => {
      const { query, clause } = setup(queryCategoryBreakout, offset);

      it("produces correct aggregation name", () => {
        const info = displayInfo(query, stageIndex, clause);
        expect(info.displayName).toBe("Count (% vs 2 rows above)");
      });
    });
  });
});
