import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { aggregate, aggregations } from "./aggregation";
import { expressionParts } from "./expression";
import { displayInfo } from "./metadata";
import {
  diffMovingAverageClause,
  movingAverageClause,
  percentDiffMovingAverageClause,
} from "./moving-average";
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

describe("movingAverageClause", () => {
  const setup = (
    query: Query,
    offset: number,
    includeCurrentPeriod: boolean = false,
  ) => {
    const [aggregation] = aggregations(query, stageIndex);
    const clause = movingAverageClause(
      aggregation,
      offset,
      includeCurrentPeriod,
    );
    const finalQuery = aggregate(query, stageIndex, clause);

    return {
      clause,
      query: finalQuery,
    };
  };

  describe("includeCurrentPeriod = false", () => {
    const includeCurrentPeriod = false;

    describe("offset = -2", () => {
      const offset = -2;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "/",
            args: [
              {
                operator: "+",
                args: [
                  {
                    operator: "offset",
                    args: [
                      {
                        operator: "count",
                        args: [],
                        options: {},
                      },
                      -1,
                    ],
                    options: {},
                  },
                  {
                    operator: "offset",
                    args: [
                      {
                        operator: "count",
                        args: [],
                        options: {},
                      },
                      -2,
                    ],
                    options: {},
                  },
                ],
                options: {},
              },
              2,
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-row moving average)");
        });
      });
    });

    describe("offset < -2", () => {
      const offset = -3;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-period moving average)");
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-row moving average)");
        });
      });
    });
  });

  describe("includeCurrentPeriod = true", () => {
    const includeCurrentPeriod = true;

    describe("offset = -2", () => {
      const offset = -2;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "/",
            args: [
              {
                operator: "+",
                args: [
                  {
                    operator: "count",
                    args: [],
                    options: {},
                  },
                  {
                    operator: "offset",
                    args: [
                      {
                        operator: "count",
                        args: [],
                        options: {},
                      },
                      -1,
                    ],
                    options: {},
                  },
                ],
                options: {},
              },
              2,
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (2-row moving average)");
        });
      });
    });

    describe("offset < -2", () => {
      const offset = -3;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-period moving average)");
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (3-row moving average)");
        });
      });
    });
  });
});

describe("diffMovingAverageClause", () => {
  const setup = (
    query: Query,
    offset: number,
    includeCurrentPeriod: boolean,
  ) => {
    const [clause] = aggregations(query, stageIndex);
    const offsettedClause = diffMovingAverageClause(
      clause,
      offset,
      includeCurrentPeriod,
    );
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    return {
      clause: offsettedClause,
      query: finalQuery,
    };
  };

  describe("includeCurrentPeriod = false", () => {
    const includeCurrentPeriod = false;

    describe("offset = -2", () => {
      const offset = -2;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "-",
            args: [
              {
                operator: "count",
                args: [],
                options: {},
              },
              {
                operator: "/",
                args: [
                  {
                    operator: "+",
                    args: [
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -1,
                        ],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -2,
                        ],
                        options: {},
                      },
                    ],
                    options: {},
                  },
                  2,
                ],
                options: {},
              },
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-row moving average)");
        });
      });
    });

    describe("offset < -2", () => {
      const offset = -3;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "-",
            args: [
              {
                operator: "count",
                args: [],
                options: {},
              },
              {
                operator: "/",
                args: [
                  {
                    operator: "+",
                    args: [
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -1,
                        ],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -2,
                        ],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -3,
                        ],
                        options: {},
                      },
                    ],
                    options: {},
                  },
                  3,
                ],
                options: {},
              },
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-row moving average)");
        });
      });
    });
  });

  describe("includeCurrentPeriod = true", () => {
    const includeCurrentPeriod = true;

    describe("offset = -2", () => {
      const offset = -2;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "-",
            args: [
              {
                operator: "count",
                args: [],
                options: {},
              },
              {
                operator: "/",
                args: [
                  {
                    operator: "+",
                    args: [
                      {
                        operator: "count",
                        args: [],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -1,
                        ],
                        options: {},
                      },
                    ],
                    options: {},
                  },
                  2,
                ],
                options: {},
              },
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 2-row moving average)");
        });
      });
    });

    describe("offset < -2", () => {
      const offset = -3;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "-",
            args: [
              {
                operator: "count",
                args: [],
                options: {},
              },
              {
                operator: "/",
                args: [
                  {
                    operator: "+",
                    args: [
                      {
                        operator: "count",
                        args: [],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -1,
                        ],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -2,
                        ],
                        options: {},
                      },
                    ],
                    options: {},
                  },
                  3,
                ],
                options: {},
              },
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (vs 3-row moving average)");
        });
      });
    });
  });
});

describe("percentDiffMovingAverageClause", () => {
  const setup = (
    query: Query,
    offset: number,
    includeCurrentPeriod: boolean,
  ) => {
    const [clause] = aggregations(query, stageIndex);
    const offsettedClause = percentDiffMovingAverageClause(
      clause,
      offset,
      includeCurrentPeriod,
    );
    const finalQuery = aggregate(query, stageIndex, offsettedClause);

    return {
      clause: offsettedClause,
      query: finalQuery,
    };
  };

  describe("includeCurrentPeriod = false", () => {
    const includeCurrentPeriod = false;

    describe("offset = -2", () => {
      const offset = -2;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "/",
            args: [
              {
                operator: "count",
                args: [],
                options: {},
              },
              {
                operator: "/",
                args: [
                  {
                    operator: "+",
                    args: [
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -1,
                        ],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -2,
                        ],
                        options: {},
                      },
                    ],
                    options: {},
                  },
                  2,
                ],
                options: {},
              },
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-row moving average)");
        });
      });
    });

    describe("offset < -2", () => {
      const offset = -3;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(toLegacyQuery(query)).toMatchObject({
            database: SAMPLE_DATABASE.id,
            query: {
              aggregation: [
                ["count"],
                [
                  "aggregation-options",
                  [
                    "/",
                    ["count"],
                    [
                      "/",
                      [
                        "+",
                        ["offset", expect.anything(), ["count"], -1],
                        ["offset", expect.anything(), ["count"], -2],
                        ["offset", expect.anything(), ["count"], -3],
                      ],
                      3,
                    ],
                  ],
                  {
                    name: "Count (% vs 3-period moving average)",
                    "display-name": "Count (% vs 3-period moving average)",
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
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-row moving average)");
        });
      });
    });
  });

  describe("includeCurrentPeriod = true", () => {
    const includeCurrentPeriod = true;

    describe("offset = -2", () => {
      const offset = -2;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "/",
            args: [
              {
                operator: "count",
                args: [],
                options: {},
              },
              {
                operator: "/",
                args: [
                  {
                    operator: "+",
                    args: [
                      {
                        operator: "count",
                        args: [],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -1,
                        ],
                        options: {},
                      },
                    ],
                    options: {},
                  },
                  2,
                ],
                options: {},
              },
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 2-row moving average)");
        });
      });
    });

    describe("offset < -2", () => {
      const offset = -3;

      describe("no breakout", () => {
        const { query, clause } = setup(
          queryNoBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-period moving average)");
        });

        it("produces correct aggregation clause", () => {
          expect(expressionParts(query, -1, clause)).toEqual({
            operator: "/",
            args: [
              {
                operator: "count",
                args: [],
                options: {},
              },
              {
                operator: "/",
                args: [
                  {
                    operator: "+",
                    args: [
                      {
                        operator: "count",
                        args: [],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -1,
                        ],
                        options: {},
                      },
                      {
                        operator: "offset",
                        args: [
                          {
                            operator: "count",
                            args: [],
                            options: {},
                          },
                          -2,
                        ],
                        options: {},
                      },
                    ],
                    options: {},
                  },
                  3,
                ],
                options: {},
              },
            ],
            options: {},
          });
        });
      });

      describe("breakout on binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-month moving average)");
        });
      });

      describe("breakout on non-binned datetime column", () => {
        const { query, clause } = setup(
          queryDateBreakoutNoBinning,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-period moving average)");
        });
      });

      describe("breakout on non-datetime column", () => {
        const { query, clause } = setup(
          queryCategoryBreakout,
          offset,
          includeCurrentPeriod,
        );

        it("produces correct aggregation name", () => {
          const info = displayInfo(query, stageIndex, clause);
          expect(info.displayName).toBe("Count (% vs 3-row moving average)");
        });
      });
    });
  });
});
