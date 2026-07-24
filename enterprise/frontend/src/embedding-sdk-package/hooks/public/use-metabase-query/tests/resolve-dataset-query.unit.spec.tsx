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
