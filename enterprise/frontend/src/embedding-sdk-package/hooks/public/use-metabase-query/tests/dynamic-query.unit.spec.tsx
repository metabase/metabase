// Register mocks before loading the modules under test.
// oxfmt-ignore
import { createMockStore, resetTestState, stagesOf } from "./setup";

import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import { count, filter, orderBy, sum } from "..";

import { TEST_SCHEMA } from "./fixtures";

beforeEach(resetTestState);
afterEach(() => {
  EMBEDDING_SDK_CONFIG.isDataApp = false;
  EMBEDDING_SDK_CONFIG.isDataAppDev = false;
});

const STATIC_QUERY = { source: TEST_SCHEMA.tables.orders };

const statusFilter = filter(
  TEST_SCHEMA.tables.orders.fields.status,
  "=",
  "paid",
);

describe("a table source", () => {
  it.each([
    ["a deployed data app", { isDataApp: true, isDataAppDev: false }],
    ["the dev preview", { isDataApp: true, isDataAppDev: true }],
    ["outside a data app", { isDataApp: false, isDataAppDev: false }],
  ])("runs as a table query in %s", async (_, config) => {
    Object.assign(EMBEDDING_SDK_CONFIG, config);

    const datasetQuery =
      await resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY);

    expect(stagesOf(datasetQuery)).toMatchObject([{ "source-table": 1 }]);
  });
});

describe("dynamic query clauses", () => {
  beforeEach(() => {
    EMBEDDING_SDK_CONFIG.isDataApp = true;
  });

  it("layers the dynamic stage on top of the static query", async () => {
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

  it("keeps the static clauses in the first stage", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      {
        source: TEST_SCHEMA.tables.orders,
        aggregations: [count()],
        breakouts: [TEST_SCHEMA.tables.orders.fields.status],
      },
      { filters: [filter({ type: "column", name: "count" }, ">", 1)] },
    );

    expect(stagesOf(datasetQuery)[0]).toMatchObject({
      "source-table": 1,
      aggregation: [["count", expect.anything()]],
      breakout: [["field", expect.anything(), 101]],
    });
  });

  it("stays a single stage when there is no dynamic part", async () => {
    const datasetQuery =
      await resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY);

    expect(stagesOf(datasetQuery)).toHaveLength(1);
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

  // Products' ID is reachable through PRODUCT_ID under the same name.
  it.each([
    ["the published card", false],
    ["the dev preview table", true],
  ])(
    "tells a result column from a same-named implicitly joinable column on %s",
    async (_source, isDataAppDev) => {
      EMBEDDING_SDK_CONFIG.isDataAppDev = isDataAppDev;

      const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
        STATIC_QUERY,
        {
          orderBys: [orderBy(TEST_SCHEMA.tables.orders.fields.id, "desc")],
        },
      );

      expect(stagesOf(datasetQuery)[1]).toMatchObject({
        "order-by": [
          ["desc", expect.anything(), ["field", expect.anything(), "ID"]],
        ],
      });
    },
  );

  // Unnamed, both sums return a column named `sum`, and the later stage cannot
  // tell them apart.
  it("orders the dynamic stage by one of two sums, by its name", async () => {
    EMBEDDING_SDK_CONFIG.isDataAppDev = true;

    const totalAmount = sum(TEST_SCHEMA.tables.orders.fields.amount, {
      name: "total amount",
    });
    const totalIds = sum(TEST_SCHEMA.tables.orders.fields.id, {
      name: "total ids",
    });

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      {
        ...STATIC_QUERY,
        aggregations: [totalAmount, totalIds],
        breakouts: [TEST_SCHEMA.tables.orders.fields.status],
      },
      { orderBys: [orderBy(totalIds, "desc")] },
    );

    expect(stagesOf(datasetQuery)).toMatchObject([
      {
        aggregation: [
          [
            "sum",
            expect.objectContaining({ name: "total amount" }),
            expect.anything(),
          ],
          [
            "sum",
            expect.objectContaining({ name: "total ids" }),
            expect.anything(),
          ],
        ],
      },
      {
        "order-by": [
          [
            "desc",
            expect.anything(),
            ["field", expect.anything(), "total ids"],
          ],
        ],
      },
    ]);
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
