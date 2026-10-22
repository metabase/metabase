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

import { count, filter, orderBy, sum } from "..";

import { TEST_SCHEMA } from "./fixtures";

beforeEach(resetTestState);

const STATIC_QUERY = {
  source: {
    type: "card",
    entityId: PUBLISHED_QUESTION_ENTITY_ID,
    columns: TEST_SCHEMA.questions.ordersQuestion.columns,
  },
} as const;

const statusFilter = filter(
  TEST_SCHEMA.tables.orders.fields.status,
  "=",
  "paid",
);

describe("a table source", () => {
  it("runs the table directly", async () => {
    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())({
      source: TEST_SCHEMA.tables.orders,
    });

    expect(stagesOf(datasetQuery)).toMatchObject([{ "source-table": 1 }]);
  });
});

describe("a card source addressed by its entity ID", () => {
  it("looks the card up by its entity ID and fetches it only once", async () => {
    const datasetQuery =
      await resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY);

    expect(datasetQuery).toMatchObject({ database: 1 });
    expect(stagesOf(datasetQuery)).toMatchObject([{ "source-card": 41 }]);
    expect(mockRunRtkEndpoint.mock.calls).toEqual([
      [
        { id: PUBLISHED_QUESTION_ENTITY_ID },
        expect.anything(),
        expect.objectContaining({ name: "getCard" }),
        { forceRefetch: false },
      ],
      [
        41,
        expect.anything(),
        expect.objectContaining({ name: "getCardQueryMetadata" }),
        { forceRefetch: false },
      ],
    ]);
  });

  it("explains a card the instance doesn't have", async () => {
    mockRunRtkEndpoint.mockRejectedValueOnce({
      status: 404,
      data: "Not found.",
    });

    await expect(
      resolveDatasetQueryInBundle(createMockStore())(STATIC_QUERY),
    ).rejects.toThrow(
      `Saved question ${PUBLISHED_QUESTION_ENTITY_ID} does not exist.`,
    );
  });
});

describe("dynamic query clauses", () => {
  it("layers the dynamic stage on top of the card", async () => {
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
    ["the card", STATIC_QUERY],
    ["a table", { source: TEST_SCHEMA.tables.orders }],
  ])(
    "tells a result column from a same-named implicitly joinable column on %s",
    async (_source, staticQuery) => {
      const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
        staticQuery,
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
    const totalAmount = sum(TEST_SCHEMA.tables.orders.fields.amount, {
      name: "total amount",
    });
    const totalIds = sum(TEST_SCHEMA.tables.orders.fields.id, {
      name: "total ids",
    });

    const datasetQuery = await resolveDatasetQueryInBundle(createMockStore())(
      {
        source: TEST_SCHEMA.tables.orders,
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
