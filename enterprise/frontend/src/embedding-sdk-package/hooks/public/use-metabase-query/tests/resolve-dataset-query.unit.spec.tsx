// oxfmt-ignore
import {
  createMockStore,
  mockFetchTableMetadata,
  mockGetMetadataUnfiltered,
  mockRunRtkEndpoint,
  resetTestState,
  stagesOf,
} from "./setup";
// oxfmt-ignore
import { TEST_SCHEMA } from "./fixtures";

// oxfmt-ignore
import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";
// oxfmt-ignore
import { cardApi } from "metabase/api";

// oxfmt-ignore
import { avg, breakout, count, filter, orderBy, sum } from "..";

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

    expect(mockGetMetadataUnfiltered).toHaveBeenCalledWith({});

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
        TEST_SCHEMA.metrics.revenue,
        count(),
        sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
        TEST_SCHEMA.tables.orders.measures.revenue,
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
            ["metric", expect.anything(), 31],
            ["count", expect.anything()],
            ["sum", expect.anything(), ["field", expect.anything(), 102]],
            ["measure", expect.anything(), 21],
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

    // The generated field's `tableId`/`sourceName` scope it to the orders table;
    // keeping them would stop it matching the question's own STATUS column.
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
