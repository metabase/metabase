// Register mocks before loading the modules under test.
// oxfmt-ignore
import {
  createMockStore,
  mockFetchTableMetadata,
  mockRunRtkEndpoint,
  mockSelectMetadataProviderUnfiltered,
  resetTestState,
  stagesOf,
} from "./setup";

import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";
import { cardApi } from "metabase/api";
import * as Lib from "metabase-lib";

import {
  aggregations,
  avg,
  breakout,
  count,
  distinct,
  filter,
  orderBy,
  sum,
} from "..";

import { TEST_METADATA, TEST_SCHEMA } from "./fixtures";

beforeEach(resetTestState);

describe("resolveDatasetQuery", () => {
  it("loads table metadata and passes the public source DSL through Lib.createTestQuery", async () => {
    const store = createMockStore();

    const datasetQuery = await resolveDatasetQueryInBundle(store)({
      source: TEST_SCHEMA.tables.orders,
      fields: [
        TEST_SCHEMA.tables.orders.fields.id,
        TEST_SCHEMA.tables.orders.fields.status,
      ],
      filters: [
        TEST_SCHEMA.tables.orders.segments.completed,
        filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
      ],
      aggregations: [count(), sum(TEST_SCHEMA.tables.orders.fields.amount)],
      breakouts: [
        breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
      ],
      orderBys: [
        orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, "desc", {
          unit: "month",
        }),
      ],
      limit: 100,
    });

    expect(mockFetchTableMetadata).toHaveBeenCalledWith({ id: 1 });

    expect(store.dispatch).toHaveBeenCalledWith({
      type: "fetchTableMetadata",
      payload: 1,
    });

    expect(mockSelectMetadataProviderUnfiltered).toHaveBeenCalledWith({}, 1);

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          fields: [
            ["field", expect.anything(), 100],
            ["field", expect.anything(), 101],
          ],
          filters: [
            ["segment", expect.anything(), 11],
            ["=", expect.anything(), ["field", expect.anything(), 101], "paid"],
          ],
          aggregation: [
            ["count", expect.anything()],
            ["sum", expect.anything(), ["field", expect.anything(), 102]],
          ],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              103,
            ],
          ],
          "order-by": [
            [
              "desc",
              expect.anything(),
              [
                "field",
                expect.objectContaining({ "temporal-unit": "month" }),
                103,
              ],
            ],
          ],
          limit: 100,
        },
      ],
    });
  });

  it("passes breakout and orderBy binning through Lib.createTestQuery", async () => {
    const { amount } = TEST_SCHEMA.tables.orders.fields;
    const binning = { strategy: "num-bins", numBins: 10 } as const;

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [count()],
      breakouts: [breakout(amount, { binning })],
      orderBys: [orderBy(amount, "asc", { binning })],
    });

    const binnedAmount = [
      "field",
      expect.objectContaining({
        binning: { strategy: "num-bins", "num-bins": 10 },
      }),
      102,
    ];

    expect(stagesOf(datasetQuery)[0]).toMatchObject({
      breakout: [binnedAmount],
      "order-by": [["asc", expect.anything(), binnedAmount]],
    });
  });

  it("passes default binning on a plain breakout object through Lib.createTestQuery", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [count()],
      breakouts: [
        {
          ...TEST_SCHEMA.tables.orders.fields.amount,
          binning: { strategy: "default" },
        },
      ],
    });

    expect(stagesOf(datasetQuery)[0].breakout).toEqual([
      [
        "field",
        expect.objectContaining({ binning: { strategy: "default" } }),
        102,
      ],
    ]);
  });

  it("passes generated table Measures to Lib.createTestQuery measure aggregations", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
    });

    expect(stagesOf(datasetQuery)[0].aggregation).toEqual([
      ["measure", expect.anything(), 21],
    ]);
  });

  it("accepts id-only table source references", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: { type: "table", id: 1 },
      fields: [TEST_SCHEMA.tables.orders.fields.id],
    });

    expect(datasetQuery).toMatchObject({
      database: 1,
      stages: [
        {
          "source-table": 1,
          fields: [["field", expect.anything(), 100]],
        },
      ],
    });
  });

  it("loads metric aggregation metadata and passes the public table source DSL through Lib.createTestQuery", async () => {
    const store = createMockStore();

    const datasetQuery = await resolveDatasetQueryInBundle(store)({
      source: TEST_SCHEMA.tables.orders,
      filters: [
        TEST_SCHEMA.tables.orders.segments.completed,
        filter(
          TEST_SCHEMA.metrics.revenue.dimensions.orders.status,
          "=",
          "paid",
        ),
      ],
      aggregations: [
        aggregations.metric(TEST_SCHEMA.metrics.revenue, { name: "revenue" }),
        count(),
        sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
        aggregations.measure(TEST_SCHEMA.tables.orders.measures.revenue, {
          name: "orders",
        }),
      ],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
          unit: "month",
        }),
      ],
      limit: 100,
    });

    expect(mockFetchTableMetadata).toHaveBeenCalledWith({ id: 1 });

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      1,
      { id: 31 },
      store.dispatch,
      cardApi.endpoints.getCard,
      { forceRefetch: false },
    );

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      2,
      31,
      store.dispatch,
      cardApi.endpoints.getCardQueryMetadata,
      { forceRefetch: false },
    );

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-table": 1,
          filters: [
            ["segment", expect.anything(), 11],
            ["=", expect.anything(), ["field", expect.anything(), 101], "paid"],
          ],
          aggregation: [
            ["metric", expect.objectContaining({ name: "revenue" }), 31],
            ["count", expect.anything()],
            ["sum", expect.anything(), ["field", expect.anything(), 102]],
            ["measure", expect.objectContaining({ name: "orders" }), 21],
          ],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              103,
            ],
          ],
          limit: 100,
        },
      ],
    });
  });

  it("builds metric queries with FK-joined dimension breakouts", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.product),
      ],
    });

    expect(datasetQuery).toMatchObject({
      database: 1,
      stages: [
        {
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
          breakout: [
            ["field", expect.objectContaining({ "source-field": 104 }), 202],
          ],
        },
      ],
    });
  });

  it("filters the dynamic stage on an FK-joined dimension of the static query", async () => {
    const product = TEST_SCHEMA.metrics.revenue.dimensions.orders.product;

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      {
        source: TEST_SCHEMA.tables.orders,
        aggregations: [TEST_SCHEMA.metrics.revenue],
        breakouts: [breakout(product)],
      },
      { filters: [filter(product, "=", "Widget")] },
    );

    expect(stagesOf(datasetQuery)[1].filters).toEqual([
      [
        "=",
        expect.anything(),
        ["field", expect.anything(), expect.stringContaining("NAME")],
        "Widget",
      ],
    ]);
  });

  it("passes generated metric dimension orderBys through Lib.createTestQuery", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
          unit: "month",
        }),
      ],
      orderBys: [
        orderBy(
          TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt,
          "desc",
          { unit: "month" },
        ),
      ],
      limit: 12,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          "source-table": 1,
          aggregation: [["metric", expect.anything(), 31]],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              103,
            ],
          ],
          "order-by": [
            [
              "desc",
              expect.anything(),
              [
                "field",
                expect.objectContaining({ "temporal-unit": "month" }),
                103,
              ],
            ],
          ],
          limit: 12,
        },
      ],
    });
  });

  it("loads saved question metadata and passes the question source through Lib.createTestQuery", async () => {
    const store = createMockStore();

    const datasetQuery = await resolveDatasetQueryInBundle(store)({
      source: TEST_SCHEMA.questions.ordersQuestion,
    });

    expect(mockFetchTableMetadata).not.toHaveBeenCalled();

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      1,
      { id: 41 },
      store.dispatch,
      cardApi.endpoints.getCard,
      { forceRefetch: false },
    );

    expect(mockRunRtkEndpoint).toHaveBeenNthCalledWith(
      2,
      41,
      store.dispatch,
      cardApi.endpoints.getCardQueryMetadata,
      { forceRefetch: false },
    );

    expect(datasetQuery).toMatchObject({
      "lib/type": "mbql/query",
      database: 1,
      stages: [
        {
          "lib/type": "mbql.stage/mbql",
          "source-card": 41,
        },
      ],
    });
  });

  it("applies query clauses on top of a saved question source", async () => {
    const totalAmount = sum(TEST_SCHEMA.questions.ordersQuestion.columns[1]);

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.questions.ordersQuestion,
      filters: [
        filter(TEST_SCHEMA.questions.ordersQuestion.columns[0], "=", "paid"),
      ],
      aggregations: [count(), totalAmount],
      breakouts: [
        breakout(TEST_SCHEMA.questions.ordersQuestion.columns[2], {
          unit: "month",
        }),
      ],
      orderBys: [orderBy(totalAmount, "desc")],
      limit: 10,
    });

    expect(datasetQuery).toMatchObject({
      database: 1,
      stages: [
        {
          "source-card": 41,
          // A card stage resolves its columns by name, not by field id.
          filters: [
            [
              "=",
              expect.anything(),
              ["field", expect.anything(), "STATUS"],
              "paid",
            ],
          ],
          aggregation: [
            ["count", expect.anything()],
            ["sum", expect.anything(), ["field", expect.anything(), "AMOUNT"]],
          ],
          breakout: [
            [
              "field",
              expect.objectContaining({ "temporal-unit": "month" }),
              "CREATED_AT",
            ],
          ],
          "order-by": [
            [
              "desc",
              expect.anything(),
              ["aggregation", expect.anything(), expect.anything()],
            ],
          ],
          limit: 10,
        },
      ],
    });
  });

  // A card stage resolves dimensions by name, so a breakout and an orderBy may
  // name the same column through different references.
  it.each([
    ["question column", "table field"],
    ["table field", "question column"],
  ])(
    "orders a grouped saved question query by a breakout given as a %s and an orderBy given as a %s",
    async (breakoutKind) => {
      const questionColumn = TEST_SCHEMA.questions.ordersQuestion.columns[0];
      const tableField = TEST_SCHEMA.tables.orders.fields.status;
      const usesQuestionColumn = breakoutKind === "question column";

      const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
        {
          source: TEST_SCHEMA.questions.ordersQuestion,
          aggregations: [count()],
          breakouts: [usesQuestionColumn ? questionColumn : tableField],
          orderBys: [
            orderBy(usesQuestionColumn ? tableField : questionColumn, "asc"),
          ],
        },
      );

      expect(stagesOf(datasetQuery)[0]).toMatchObject({
        "source-card": 41,
        breakout: [["field", expect.anything(), "STATUS"]],
        "order-by": [["asc", expect.anything(), expect.anything()]],
      });
    },
  );

  it("resolves saved question filters that reuse a generated table field", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.questions.ordersQuestion,
      filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
    });

    // The question's STATUS column comes from the orders table, so the table
    // field's `tableId` still matches it.
    expect(stagesOf(datasetQuery)[0].filters).toEqual([
      ["=", expect.anything(), ["field", expect.anything(), "STATUS"], "paid"],
    ]);
  });

  // Ordering alone does not group a query, so the orderBy does not have to
  // match a breakout — `isGroupedQuery` must ignore `orderBys`.
  it("orders an ungrouped saved question query by any result column", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.questions.ordersQuestion,
      orderBys: [
        orderBy(TEST_SCHEMA.questions.ordersQuestion.columns[1], "desc"),
      ],
      limit: 5,
    });

    expect(stagesOf(datasetQuery)[0]).toMatchObject({
      "source-card": 41,
      "order-by": [
        ["desc", expect.anything(), ["field", expect.anything(), "AMOUNT"]],
      ],
      limit: 5,
    });
  });

  // `/api/card/:id/query_metadata` returns empty databases/tables/fields for a
  // user who may read the card but not create queries. Lib then cannot resolve a
  // database and omits `:database`, which `/api/dataset` rejects outright.
  //
  // Built without spreading `TEST_METADATA`: `Lib.metadataProvider` caches the
  // provider on the metadata object itself, so copying that key would hand back
  // a provider built from the full metadata and the empty databases would be
  // ignored.
  it("sets the database when the user cannot see database metadata", async () => {
    const metadataWithoutDatabases = {
      databases: {},
      tables: {},
      fields: {},
      segments: {},
      measures: {},
      questions: TEST_METADATA.questions,
    };

    mockSelectMetadataProviderUnfiltered.mockImplementation(
      (_state, databaseId) =>
        Lib.metadataProvider(
          databaseId,
          // The fixture supplies the plain metadata shape instead of the Metadata class.
          metadataWithoutDatabases as unknown as Lib.Metadata,
        ),
    );

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.questions.ordersQuestion,
    });

    expect(datasetQuery).toMatchObject({
      database: 1,
      stages: [{ "source-card": 41 }],
    });
  });

  it("applies filters to id-only saved question sources", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: { type: "card", id: 41 },
      filters: [filter({ type: "column", name: "STATUS" }, "=", "paid")],
    });

    expect(datasetQuery).toMatchObject({
      database: 1,
      stages: [
        {
          "source-card": 41,
          filters: [
            [
              "=",
              expect.anything(),
              ["field", expect.anything(), "STATUS"],
              "paid",
            ],
          ],
        },
      ],
    });
  });

  it("passes aggregation result orderBys through Lib.createTestQuery", async () => {
    const avgAmount = avg(TEST_SCHEMA.tables.orders.fields.amount);

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [avgAmount],
      breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
      orderBys: [orderBy(avgAmount, "desc")],
      limit: 15,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          aggregation: [
            ["avg", expect.anything(), ["field", expect.anything(), 102]],
          ],
          breakout: [["field", expect.anything(), 101]],
          "order-by": [
            [
              "desc",
              expect.anything(),
              ["aggregation", expect.anything(), expect.anything()],
            ],
          ],
          limit: 15,
        },
      ],
    });
  });

  it("passes metric aggregation result orderBys through Lib.createTestQuery", async () => {
    const avgAmount = avg(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount);

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue, avgAmount],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.status),
      ],
      orderBys: [orderBy(avgAmount, "desc")],
      limit: 15,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          aggregation: [
            ["metric", expect.anything(), 31],
            ["avg", expect.anything(), ["field", expect.anything(), 102]],
          ],
          breakout: [["field", expect.anything(), 101]],
          "order-by": [
            [
              "desc",
              expect.anything(),
              ["aggregation", expect.anything(), expect.anything()],
            ],
          ],
          limit: 15,
        },
      ],
    });
  });

  it("passes metric aggregation orderBys through Lib.createTestQuery", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.status),
      ],
      orderBys: [orderBy(TEST_SCHEMA.metrics.revenue, "desc")],
      limit: 15,
    });

    expect(datasetQuery).toMatchObject({
      stages: [
        {
          aggregation: [["metric", expect.anything(), 31]],
          breakout: [["field", expect.anything(), 101]],
          "order-by": [
            [
              "desc",
              expect.anything(),
              ["aggregation", expect.anything(), expect.anything()],
            ],
          ],
          limit: 15,
        },
      ],
    });
  });
});

describe("resolveDatasetQuery aggregation column names", () => {
  const orders = TEST_SCHEMA.tables.orders;

  it("refuses aggregations that share a column name", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: orders,
        aggregations: [count(), distinct(orders.fields.status)],
      }),
    ).rejects.toThrow(
      'Aggregations and named breakouts need unique column names: Count, Distinct values of Status share the column name "count". Name them apart with the `name` option of an aggregation helper, or with `aggregations.measure` or `aggregations.metric` for a measure or metric.',
    );
  });

  it("accepts aggregations named apart", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: orders,
      aggregations: [
        count(),
        distinct(orders.fields.status, { name: "statuses" }),
      ],
    });

    expect(stagesOf(datasetQuery)[0].aggregation).toEqual([
      ["count", expect.anything()],
      [
        "distinct",
        expect.objectContaining({ name: "statuses" }),
        ["field", expect.anything(), 101],
      ],
    ]);
  });

  it("leaves a measure's own name out of its column name", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: orders,
      aggregations: [orders.measures.revenue],
    });

    expect(stagesOf(datasetQuery)[0].aggregation).toEqual([
      ["measure", expect.not.objectContaining({ name: "Revenue" }), 21],
    ]);
  });

  it("refuses a measure that shares a column name with another aggregation", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: orders,
        aggregations: [orders.measures.revenue, count()],
      }),
    ).rejects.toThrow('share the column name "count"');
  });

  it("passes a measure through aggregations.measure unchanged without a name", () => {
    expect(aggregations.measure(orders.measures.revenue)).toBe(
      orders.measures.revenue,
    );
  });

  it("names a measure's column with aggregations.measure", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: orders,
      aggregations: [
        aggregations.measure(orders.measures.revenue, { name: "revenue" }),
        count(),
      ],
    });

    expect(stagesOf(datasetQuery)[0].aggregation).toEqual([
      ["measure", expect.objectContaining({ name: "revenue" }), 21],
      ["count", expect.anything()],
    ]);
  });

  it("refuses an orderBy on a column two aggregations share with the same message", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: orders,
        aggregations: [count(), distinct(orders.fields.status)],
        breakouts: [breakout(orders.fields.createdAt, { unit: "month" })],
        orderBys: [{ type: "column", name: "count" }],
      }),
    ).rejects.toThrow('share the column name "count"');
  });

  it("refuses named breakouts that share a column name", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: orders,
        aggregations: [count()],
        breakouts: [
          {
            type: "breakout",
            name: "period",
            column: { ...orders.fields.createdAt, unit: "month" },
          },
          {
            type: "breakout",
            name: "period",
            column: { ...orders.fields.createdAt, unit: "year" },
          },
        ],
      }),
    ).rejects.toThrow('share the column name "period"');
  });

  it("refuses a named breakout that shares an aggregation's column name", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: orders,
        aggregations: [count()],
        breakouts: [
          { type: "breakout", name: "count", column: orders.fields.status },
        ],
      }),
    ).rejects.toThrow('share the column name "count"');
  });

  it("accepts a field broken out twice without names", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: orders,
      aggregations: [count()],
      breakouts: [
        breakout(orders.fields.createdAt, { unit: "month" }),
        breakout(orders.fields.createdAt, { unit: "year" }),
      ],
    });

    expect(stagesOf(datasetQuery)[0].breakout).toHaveLength(2);
  });

  it("refuses dynamic aggregations that share a column name", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())(
        {
          source: orders,
          aggregations: [count()],
          breakouts: [breakout(orders.fields.status)],
        },
        {
          aggregations: [count(), distinct({ type: "column", name: "STATUS" })],
        },
      ),
    ).rejects.toThrow('share the column name "count"');
  });
});
