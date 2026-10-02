// Register mocks before loading the modules under test.
// oxfmt-ignore
import {
  PUBLISHED_QUESTION_ENTITY_ID,
  createMockStore,
  mockRunRtkEndpoint,
  resetTestState,
  stagesOf,
} from "./setup";

import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";
import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

import { count, filter, orderBy, sum } from "..";

import { TEST_SCHEMA } from "./fixtures";

beforeEach(resetTestState);
afterEach(() => {
  EMBEDDING_SDK_CONFIG.isDataApp = false;
  EMBEDDING_SDK_CONFIG.isDataAppDev = false;
});

const STATIC_QUERY = {
  source: TEST_SCHEMA.tables.orders,
  savedQuestionEntityId: PUBLISHED_QUESTION_ENTITY_ID,
};

const statusFilter = filter(
  TEST_SCHEMA.tables.orders.fields.status,
  "=",
  "paid",
);

describe("a table source without a saved question", () => {
  const QUERY_WITHOUT_SAVED_QUESTION = { source: TEST_SCHEMA.tables.orders };

  it("is refused in a deployed data app", async () => {
    EMBEDDING_SDK_CONFIG.isDataApp = true;

    await expect(
      resolveDatasetQueryInBundle(createMockStore())(
        QUERY_WITHOUT_SAVED_QUESTION,
      ),
    ).rejects.toThrow(
      "This query has no saved question. Write it to the app's `resources/cards/`",
    );
  });

  it("still runs in the dev preview, before the app's resources exist", async () => {
    EMBEDDING_SDK_CONFIG.isDataApp = true;
    EMBEDDING_SDK_CONFIG.isDataAppDev = true;

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      QUERY_WITHOUT_SAVED_QUESTION,
    );

    expect(stagesOf(datasetQuery)).toMatchObject([{ "source-table": 1 }]);
  });

  it("still runs outside a data app, where the SDK addresses tables directly", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      QUERY_WITHOUT_SAVED_QUESTION,
    );

    expect(stagesOf(datasetQuery)).toMatchObject([{ "source-table": 1 }]);
  });
});

describe("a table source backed by a saved question in a deployed data app", () => {
  beforeEach(() => {
    EMBEDDING_SDK_CONFIG.isDataApp = true;
  });

  it("looks the published card up by its entity ID", async () => {
    const datasetQuery =
      await resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY);

    expect(stagesOf(datasetQuery)[0]).toMatchObject({ "source-card": 41 });
    expect(mockRunRtkEndpoint).toHaveBeenCalledWith(
      { id: PUBLISHED_QUESTION_ENTITY_ID },
      expect.anything(),
      expect.objectContaining({ name: "getCard" }),
      { forceRefetch: false },
    );
  });

  it("explains a published card the instance hasn't imported yet", async () => {
    mockRunRtkEndpoint.mockRejectedValueOnce({
      status: 404,
      data: "Not found.",
    });

    await expect(
      resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY),
    ).rejects.toThrow("This app's saved questions have not been imported.");
  });
});

describe("dynamic query clauses", () => {
  // The swap these cover is a data-app rule; elsewhere the table is what runs.
  beforeEach(() => {
    EMBEDDING_SDK_CONFIG.isDataApp = true;
  });

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

  // The static clauses are already inside the published card, so the swapped
  // source must drop them rather than apply them a second time.
  it("drops the static clauses when it swaps in the published card", async () => {
    const aggregatingQuery = {
      source: TEST_SCHEMA.tables.orders,
      aggregations: [count()],
      breakouts: [TEST_SCHEMA.tables.orders.fields.status],
      savedQuestionEntityId: PUBLISHED_QUESTION_ENTITY_ID,
    };

    const production = await resolveDatasetQueryInBundle(createMockStore())(
      aggregatingQuery,
      { filters: [filter({ type: "column", name: "STATUS" }, "=", "paid")] },
    );

    expect(stagesOf(production)[0]).toEqual({
      "lib/type": "mbql.stage/mbql",
      "source-card": 41,
    });

    // The dev preview keeps them, since nothing has been published into a card.
    EMBEDDING_SDK_CONFIG.isDataAppDev = true;

    const preview = await resolveDatasetQueryInBundle(createMockStore())(
      aggregatingQuery,
      { filters: [filter({ type: "column", name: "count" }, ">", 1)] },
    );

    expect(stagesOf(preview)[0]).toMatchObject({
      "source-table": 1,
      aggregation: [["count", expect.anything()]],
      breakout: [["field", expect.anything(), 101]],
    });
  });

  it("stays a single stage when there is no dynamic part", async () => {
    const datasetQuery =
      await resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY);

    expect(stagesOf(datasetQuery)).toMatchObject([{ "source-card": 41 }]);
  });

  it("layers the dynamic stage on a preview query that has no card", async () => {
    EMBEDDING_SDK_CONFIG.isDataAppDev = true;

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
