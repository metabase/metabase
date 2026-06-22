import { act } from "@testing-library/react";

import { render, screen } from "__support__/ui";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { SdkLoadingState } from "embedding-sdk-shared/types/sdk-loading";
import { createMetabaseQuery as createMetabaseQueryInBundle } from "metabase/embedding-sdk/lib/create-metabase-query/create-metabase-query";

import {
  avg,
  breakout,
  count,
  createMetabaseQuery,
  distinct,
  filter,
  sum,
  useMetabaseQueryObject,
} from "./use-metabase-query";
import { TEST_SCHEMA } from "./use-metabase-query.test-support";

const expectedOrdersQuery = {
  type: "query",
  database: 1,
  query: {
    "source-table": 1,
    filter: ["=", ["field", 101, {}], "paid"],
    aggregation: [["count"]],
    breakout: [["field", 103, {}]],
  },
  parameters: [],
};

describe("createMetabaseQuery", () => {
  beforeEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
    window.METABASE_EMBEDDING_SDK_BUNDLE = {
      createMetabaseQuery: createMetabaseQueryInBundle,
    } as typeof window.METABASE_EMBEDDING_SDK_BUNDLE;
  });

  it("builds a complete dataset query from a generated table schema", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
        breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.createdAt)],
      }),
    ).toEqual(expectedOrdersQuery);
  });

  it("memoizes a complete dataset query from a generated table schema", () => {
    render(<MetabaseQueryObjectComponent />);

    expect(
      JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
    ).toEqual(expectedOrdersQuery);
  });

  it("returns null from useMetabaseQueryObject before the SDK bundle loads", () => {
    delete window.METABASE_EMBEDDING_SDK_BUNDLE;

    render(<MetabaseQueryObjectComponent />);

    expect(screen.getByTestId("query-object")).toHaveTextContent("null");
  });

  it("builds a query object after the SDK bundle loading state changes", () => {
    delete window.METABASE_EMBEDDING_SDK_BUNDLE;

    render(<MetabaseQueryObjectComponent />);

    expect(screen.getByTestId("query-object")).toHaveTextContent("null");

    window.METABASE_EMBEDDING_SDK_BUNDLE = {
      createMetabaseQuery: createMetabaseQueryInBundle,
    } as unknown as typeof window.METABASE_EMBEDDING_SDK_BUNDLE;

    act(() => {
      ensureMetabaseProviderPropsStore().updateInternalProps({
        loadingState: SdkLoadingState.Loaded,
      });
    });

    expect(
      JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
    ).toEqual(expectedOrdersQuery);
  });

  it("builds explicit count aggregations", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        aggregations: [count()],
        breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
      }),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["count"]],
        breakout: [["field", 101, {}]],
      },
      parameters: [],
    });
  });

  it("supports count aggregation object literals", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        aggregations: [{ type: "count" }],
        breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
      }),
    ).toMatchObject({
      query: {
        aggregation: [["count"]],
      },
    });
  });

  it("builds field aggregation helpers", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        aggregations: [
          sum(TEST_SCHEMA.tables.orders.fields.amount),
          avg(TEST_SCHEMA.tables.orders.fields.amount),
          distinct(TEST_SCHEMA.tables.orders.fields.status),
        ],
        breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
      }),
    ).toMatchObject({
      query: {
        aggregation: [
          ["sum", ["field", 102, {}]],
          ["avg", ["field", 102, {}]],
          ["distinct", ["field", 101, {}]],
        ],
        breakout: [["field", 101, {}]],
      },
    });
  });

  it("does not force minute bucketing for date filters", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        filters: [
          filter(TEST_SCHEMA.tables.orders.fields.orderDate, "=", "2026-06-18"),
        ],
      }),
    ).toMatchObject({
      query: {
        filter: ["=", ["field", 105, {}], "2026-06-18"],
      },
    });
  });

  it("uses effective or base type to preserve time for datetime filters", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        filters: [
          filter(
            TEST_SCHEMA.tables.orders.fields.createdAt,
            "=",
            new Date(2026, 5, 18, 12, 30),
          ),
        ],
      }),
    ).toMatchObject({
      query: {
        filter: ["=", ["field", 103, {}], "2026-06-18T12:30:00"],
      },
    });
  });

  it("builds time-interval filters through metabase-lib", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        filters: [
          {
            dimension: TEST_SCHEMA.tables.orders.fields.createdAt,
            operator: "time-interval",
            values: [-30, "day", { "include-current": true }],
          },
        ],
      }),
    ).toMatchObject({
      query: {
        filter: [
          "time-interval",
          ["field", 103, {}],
          -30,
          "day",
          { "include-current": true },
        ],
      },
    });
  });

  it("supports field aggregation object literals", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        aggregations: [
          { type: "max", dimension: TEST_SCHEMA.tables.orders.fields.amount },
        ],
      }),
    ).toMatchObject({
      query: {
        aggregation: [["max", ["field", 102, {}]]],
      },
    });
  });

  it("preserves default binning when metabase-lib has no default strategy", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        breakouts: [
          breakout(TEST_SCHEMA.tables.orders.fields.amount, {
            binning: { strategy: "default" },
          }),
        ],
      }),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["count"]],
        breakout: [["field", 102, { binning: { strategy: "default" } }]],
      },
      parameters: [],
    });
  });

  it("builds binned table breakouts through metabase-lib", () => {
    expect(
      createMetabaseQuery({
        table: TEST_SCHEMA.tables.orders,
        breakouts: [
          breakout(TEST_SCHEMA.tables.orders.fields.amount, {
            binning: { strategy: "num-bins", "num-bins": 10 },
          }),
        ],
      }),
    ).toMatchObject({
      query: {
        breakout: [
          ["field", 102, { binning: { strategy: "num-bins", "num-bins": 10 } }],
        ],
      },
    });
  });

  it("builds a complete dataset query from a generated metric schema", () => {
    expect(
      createMetabaseQuery({
        metric: TEST_SCHEMA.metrics.orderCount,
        filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
        measures: [TEST_SCHEMA.tables.orders.measures.revenue],
        breakouts: [
          breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.createdAt, {
            bucket: "month",
          }),
        ],
      }),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [
          ["metric", 34],
          [
            "aggregation-options",
            ["measure", 21],
            { "display-name": "Measure 21" },
          ],
        ],
        filter: ["=", ["field", 101, {}], "paid"],
        breakout: [["field", 103, { "temporal-unit": "month" }]],
      },
      parameters: [],
    });
  });

  it("adds source-field when metric dimensions reference an implicitly joined table", () => {
    expect(
      createMetabaseQuery({
        metric: TEST_SCHEMA.metrics.orderCount,
        breakouts: [
          breakout(TEST_SCHEMA.metrics.orderCount.dimensions.franchises.name),
        ],
        filters: [
          filter(
            TEST_SCHEMA.metrics.orderCount.dimensions.franchises.name,
            "=",
            "West Coast Boba",
          ),
        ],
      }),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["metric", 34]],
        filter: [
          "=",
          ["field", 301, { "source-field": 106 }],
          "West Coast Boba",
        ],
        breakout: [["field", 301, { "source-field": 106 }]],
      },
      parameters: [],
    });
  });

  it("adds source-field through the metabase-lib metric builder", () => {
    expect(
      createMetabaseQueryInBundle({
        metric: TEST_SCHEMA.metrics.orderCount,
        breakouts: [
          breakout(TEST_SCHEMA.metrics.orderCount.dimensions.franchises.name),
        ],
        filters: [
          filter(
            TEST_SCHEMA.metrics.orderCount.dimensions.franchises.name,
            "=",
            "West Coast Boba",
          ),
        ],
      }),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["metric", 34]],
        filter: [
          "=",
          ["field", 301, { "source-field": 106 }],
          "West Coast Boba",
        ],
        breakout: [["field", 301, { "source-field": 106 }]],
      },
      parameters: [],
    });
  });

  it("builds binned metric breakouts through metabase-lib", () => {
    expect(
      createMetabaseQuery({
        metric: TEST_SCHEMA.metrics.orderCount,
        breakouts: [
          breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.amount, {
            binning: { strategy: "num-bins", "num-bins": 10 },
          }),
        ],
      }),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["metric", 34]],
        breakout: [
          ["field", 102, { binning: { strategy: "num-bins", "num-bins": 10 } }],
        ],
      },
      parameters: [],
    });
  });

  it("memoizes a complete dataset query from a generated metric schema", () => {
    render(<MetricQueryObjectComponent />);

    expect(
      JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["metric", 34]],
        breakout: [["field", 101, {}]],
      },
      parameters: [],
    });
  });

  it("keeps generated metric query objects on the dataset query path", () => {
    render(<MetricQueryObjectComponent />);

    expect(
      JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": 1,
        aggregation: [["metric", 34]],
        breakout: [["field", 101, {}]],
      },
      parameters: [],
    });
  });

  it("builds generated source-card metric query objects on the dataset query path", () => {
    render(<SourceCardMetricQueryObjectComponent />);

    expect(
      JSON.parse(screen.getByTestId("query-object").textContent ?? ""),
    ).toEqual({
      type: "query",
      database: 1,
      query: {
        "source-table": "card__98",
        aggregation: [["metric", 36]],
        breakout: [["field", 103, { "temporal-unit": "month" }]],
      },
      parameters: [],
    });
  });
});

const MetabaseQueryObjectComponent = () => {
  const query = useMetabaseQueryObject({
    table: TEST_SCHEMA.tables.orders,
    filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
    breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.createdAt)],
  });

  return <div data-testid="query-object">{JSON.stringify(query)}</div>;
};

const MetricQueryObjectComponent = () => {
  const query = useMetabaseQueryObject({
    metric: TEST_SCHEMA.metrics.orderCount,
    breakouts: [
      breakout(TEST_SCHEMA.metrics.orderCount.dimensions.orders.status),
    ],
  });

  return <div data-testid="query-object">{JSON.stringify(query)}</div>;
};

const SourceCardMetricQueryObjectComponent = () => {
  const query = useMetabaseQueryObject({
    metric: TEST_SCHEMA.metrics.orderCountFromModel,
    breakouts: [
      breakout(
        TEST_SCHEMA.metrics.orderCountFromModel.dimensions.orders.createdAt,
        { bucket: "month" },
      ),
    ],
  });

  return <div data-testid="query-object">{JSON.stringify(query)}</div>;
};
