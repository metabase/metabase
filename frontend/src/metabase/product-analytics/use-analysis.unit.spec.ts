import fetchMock from "fetch-mock";

import { setupAdhocQueryEndpoint } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Dataset, Table } from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockField,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { useAnalysis } from "./use-analysis";

const EVENT_TABLE = createOrdersTable({
  entity_type: "entity/EventTable",
  event_settings: {
    "columns.timestamp": "CREATED_AT",
    "columns.person": "USER_ID",
  },
});

const HABIT_DATASET: Dataset = createMockDataset({
  data: {
    cols: [
      createMockColumn({ name: "periods", base_type: "type/Integer" }),
      createMockColumn({ name: "people", base_type: "type/Integer" }),
    ],
    rows: [[1, 10]],
  },
});

type SetupOpts = {
  table?: Table;
  dataset?: Dataset;
  storedSettings?: Record<string, unknown>;
};

const setup = ({
  table = EVENT_TABLE,
  dataset = HABIT_DATASET,
  storedSettings = {},
}: SetupOpts) => {
  setupAdhocQueryEndpoint(dataset);
  return renderHookWithProviders(
    () => useAnalysis({ kind: "habit", table, storedSettings }),
    {
      storeInitialState: createMockState({
        entities: createMockEntitiesState({
          databases: [createSampleDatabase()],
        }),
      }),
    },
  );
};

const getRunRequests = () => fetchMock.callHistory.calls("path:/api/dataset");

describe("useAnalysis", () => {
  it("runs the analysis's query once, and gives its result", async () => {
    const { result } = setup({});

    await waitFor(() => expect(result.current.rawSeries).not.toBeNull());
    expect(result.current.rawSeries?.[0]).toMatchObject({
      card: { name: "How many days did people show up?", display: "bar" },
      data: { rows: [[1, 10]] },
    });
    expect(result.current.error).toBeUndefined();
    expect(getRunRequests()).toHaveLength(1);
    expect(await getRunRequests()[0].request?.json()).toMatchObject({
      database: EVENT_TABLE.db_id,
      stages: [{ "source-table": ORDERS_ID }, {}],
    });
  });

  it("computes the settings from the stored ones, and runs with them", async () => {
    const { result } = setup({
      storedSettings: { granularity: "week" },
    });

    expect(result.current.settings).toEqual({
      base_query: expect.anything(),
      date_range: "past90days",
      counting: "person",
      granularity: "week",
      drill: null,
      "habit.active": null,
      "habit.values": "count",
    });
    await waitFor(() => expect(result.current.rawSeries).not.toBeNull());
    expect(result.current.rawSeries?.[0].card.name).toBe(
      "How many weeks did people show up?",
    );
    const request: unknown = await getRunRequests()[0].request?.json();
    expect(JSON.stringify(request)).toContain('"temporal-unit":"week"');
  });

  it("runs with the stored base query's filters, and gives it as a query", async () => {
    const baseQuery = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          filters: [
            {
              type: "operator",
              operator: ">",
              args: [
                { type: "column", name: "TOTAL" },
                { type: "literal", value: 100 },
              ],
            },
          ],
        },
      ],
    });
    const { result } = setup({
      storedSettings: { base_query: Lib.toJsQuery(baseQuery) },
    });

    expect(result.current.settings?.base_query).toEqual(
      Lib.toJsQuery(baseQuery),
    );
    const resultBaseQuery = result.current.baseQuery;
    expect(
      resultBaseQuery &&
        Lib.filters(resultBaseQuery, -1).map(
          (filter) => Lib.displayInfo(resultBaseQuery, -1, filter).displayName,
        ),
    ).toEqual(["Total is greater than 100"]);
    await waitFor(() => expect(getRunRequests()).toHaveLength(1));
    const request: unknown = await getRunRequests()[0].request?.json();
    // The stored filter, then the date range's.
    expect(request).toMatchObject({
      stages: [
        {
          filters: [
            [">", {}, ["field", {}, ORDERS.TOTAL], 100],
            expect.anything(),
          ],
        },
        {},
      ],
    });
  });

  it("gives the error a run failed with", async () => {
    const { result } = setup({
      dataset: createMockDataset({
        status: "failed",
        error: "The table is gone",
      }),
    });

    await waitFor(() => expect(result.current.error).toBe("The table is gone"));
    expect(result.current.rawSeries).toBeNull();
  });

  it("gives an error, without running, when the query can't be built", () => {
    // The table's settings name a column its metadata doesn't have.
    const table = createOrdersTable({
      ...EVENT_TABLE,
      fields: [
        ...(EVENT_TABLE.fields ?? []),
        createMockField({ table_id: ORDERS_ID, name: "VISITOR_ID" }),
      ],
      event_settings: {
        "columns.timestamp": "CREATED_AT",
        "columns.person": "VISITOR_ID",
      },
    });
    const { result } = setup({ table });

    expect(result.current.analysis).toBeUndefined();
    expect(result.current.settings).toEqual({
      base_query: expect.anything(),
      date_range: "past90days",
      counting: "person",
      granularity: "day",
      drill: null,
      "habit.active": null,
      "habit.values": "count",
    });
    expect(result.current.isRunning).toBe(false);
    expect(result.current.error).toMatch(/No person column/);
    expect(getRunRequests()).toHaveLength(0);
  });
});
