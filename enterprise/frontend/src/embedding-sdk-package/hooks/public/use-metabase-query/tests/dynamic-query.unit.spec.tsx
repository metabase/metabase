import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import { count, filter, orderBy } from "..";

import { TEST_SCHEMA } from "./fixtures";
import { createMockStore, resetTestState, stagesOf } from "./setup";

beforeEach(resetTestState);
afterEach(() => {
  EMBEDDING_SDK_CONFIG.isDataAppDev = false;
});

const STATIC_QUERY = {
  source: TEST_SCHEMA.tables.orders,
  savedQuestionSourceId: 41,
};

const statusFilter = filter(
  TEST_SCHEMA.tables.orders.fields.status,
  "=",
  "paid",
);

describe("dynamic query clauses", () => {
  it("runs the published card in production and layers the dynamic stage on top", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      STATIC_QUERY,
      { filters: [statusFilter] },
    );

    expect(stagesOf(datasetQuery)).toMatchObject([
      { "source-card": 41 },
      {
        filters: [
          [
            "=",
            expect.anything(),
            ["field", expect.anything(), "STATUS"],
            "paid",
          ],
        ],
      },
    ]);
  });

  it("keeps the table source in the dev preview, with the same dynamic stage", async () => {
    EMBEDDING_SDK_CONFIG.isDataAppDev = true;

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      STATIC_QUERY,
      { filters: [statusFilter] },
    );

    expect(stagesOf(datasetQuery)).toMatchObject([
      { "source-table": 1 },
      {
        filters: [
          [
            "=",
            expect.anything(),
            ["field", expect.anything(), "STATUS"],
            "paid",
          ],
        ],
      },
    ]);
  });

  it("stays a single stage when there is no dynamic part", async () => {
    const datasetQuery =
      await resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY);

    expect(stagesOf(datasetQuery)).toMatchObject([{ "source-card": 41 }]);
  });

  it("ignores the published card for a query that has none", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      { source: TEST_SCHEMA.tables.orders },
      { filters: [statusFilter] },
    );

    expect(stagesOf(datasetQuery)).toMatchObject([
      { "source-table": 1 },
      { filters: [expect.anything()] },
    ]);
  });

  it("groups and orders in the dynamic stage", async () => {
    const countAgg = count();

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      STATIC_QUERY,
      {
        filters: [statusFilter],
        aggregations: [countAgg],
        breakouts: [TEST_SCHEMA.tables.orders.fields.status],
        orderBys: [orderBy(countAgg, "desc")],
        limit: 5,
      },
    );

    expect(stagesOf(datasetQuery)[1]).toMatchObject({
      aggregation: [["count", expect.anything()]],
      breakout: [["field", expect.anything(), "STATUS"]],
      "order-by": [["desc", expect.anything(), expect.anything()]],
      limit: 5,
    });
  });

  it("rejects table-scoped references in the dynamic part", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY, {
        // @ts-expect-error Segments belong to a table source
        filters: [TEST_SCHEMA.tables.orders.segments.completed],
      }),
    ).rejects.toThrow(
      "Dynamic query filters cannot use Segments, which belong to a table source.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY, {
        // @ts-expect-error Measures belong to a table source
        aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
      }),
    ).rejects.toThrow(
      "Dynamic query aggregations cannot use Measures or Metrics, which belong to a table source.",
    );
  });

  it("rejects an invalid dynamic limit", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY, {
        limit: 0,
      }),
    ).rejects.toThrow("Dynamic query limit must be a positive integer.");
  });
});
