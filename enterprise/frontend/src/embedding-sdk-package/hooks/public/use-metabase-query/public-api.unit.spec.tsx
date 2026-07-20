/* eslint-disable import/order */

import { TEST_SCHEMA } from "./tests/fixtures";

import * as DataApp from "../../../data-app";
import type { RowValue } from "../data-schema";

import type { MetabaseCard } from "metabase/embedding-sdk/types/question";

import type { MetabaseQueryOptions, UseMetabaseQueryObjectResult } from ".";
import { breakout, filter, orderBy, sum, useMetabaseQuery } from ".";

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];
type OrdersQuestion = (typeof TEST_SCHEMA)["questions"]["ordersQuestion"];

const _validTableQuery = {
  source: TEST_SCHEMA.tables.orders,
  fields: [
    TEST_SCHEMA.tables.orders.fields.id,
    TEST_SCHEMA.tables.orders.fields.status,
  ],
  filters: [
    TEST_SCHEMA.tables.orders.segments.completed,
    filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid"),
  ],
  aggregations: [
    TEST_SCHEMA.tables.orders.measures.revenue,
    sum(TEST_SCHEMA.tables.orders.fields.amount),
  ],
  breakouts: [
    breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
  ],
  orderBys: [
    orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, "desc", {
      unit: "month",
    }),
  ],
  limit: 100,
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableSegmentQuery = {
  source: TEST_SCHEMA.tables.orders,
  filters: [
    // @ts-expect-error segments must belong to the source table
    TEST_SCHEMA.tables.products.segments.active,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableMeasureQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error measures must belong to the source table
    TEST_SCHEMA.tables.products.measures.price,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidCrossTableFieldQuery = {
  source: TEST_SCHEMA.tables.orders,
  fields: [
    // @ts-expect-error fields must belong to the source table
    TEST_SCHEMA.tables.products.fields.price,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validTableQueryWithMetricAggregation = {
  source: TEST_SCHEMA.tables.orders,
  filters: [
    TEST_SCHEMA.tables.orders.segments.completed,
    filter(TEST_SCHEMA.metrics.revenue.dimensions.orders.status, "=", "paid"),
  ],
  aggregations: [
    TEST_SCHEMA.metrics.revenue,
    TEST_SCHEMA.tables.orders.measures.revenue,
    sum(TEST_SCHEMA.metrics.revenue.dimensions.orders.amount),
  ],
  breakouts: [
    breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
      unit: "month",
    }),
  ],
  orderBys: [
    orderBy(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, "desc", {
      unit: "month",
    }),
  ],
  limit: 100,
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validTableQueryWithJoinedMetricBreakout = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [TEST_SCHEMA.metrics.revenue],
  breakouts: [breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.product)],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _validSavedQuestionQuery = {
  source: TEST_SCHEMA.questions.ordersQuestion,
} satisfies MetabaseQueryOptions<OrdersQuestion>;

const _invalidSavedQuestionClauseQuery = {
  source: TEST_SCHEMA.questions.ordersQuestion,

  // @ts-expect-error saved question queries only support source and enabled
  fields: [TEST_SCHEMA.questions.ordersQuestion.columns[0]],
} satisfies MetabaseQueryOptions<OrdersQuestion>;

const _validCardQuery = {
  query: {
    "lib/type": "mbql/query",
    database: 1,
    stages: [],
  },
} satisfies MetabaseCard;

// Only this value's *type* is used: the fixtures below typecheck, they never run.
const hookResult = {} as UseMetabaseQueryObjectResult;
const _validHookResultCard = {
  query: hookResult.query,
} satisfies MetabaseCard;

const _invalidHookResultCard = {
  // @ts-expect-error pass useMetabaseQueryObject(...).query, not the whole hook result
  query: hookResult,
} satisfies MetabaseCard;

const _invalidCrossTableMetricAggregationQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error metric aggregations must belong to the source table
    TEST_SCHEMA.metrics.productRevenue,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidIdOnlyMetricAggregationQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error metric aggregations must include source table metadata
    { type: "metric", id: 31 },
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidSourceCardMetricAggregationQuery = {
  source: TEST_SCHEMA.tables.orders,
  aggregations: [
    // @ts-expect-error source-card metric aggregations need a saved question source
    TEST_SCHEMA.metrics.questionRevenue,
  ],
} satisfies MetabaseQueryOptions<OrdersTable>;

const _invalidMetricSourceQuery = {
  // @ts-expect-error Metrics must be used in aggregations, not as query sources
  source: TEST_SCHEMA.metrics.revenue,
} satisfies MetabaseQueryOptions;

function TypeFixtures() {
  const selectedFieldsResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    fields: [TEST_SCHEMA.tables.orders.fields.id],
  });

  const selectedFieldValue: number | null | undefined =
    selectedFieldsResult.data?.rows[0]?.ID;

  void selectedFieldValue;

  const selectedFieldsQuery = {
    source: TEST_SCHEMA.tables.orders,
    fields: [
      TEST_SCHEMA.tables.orders.fields.id,
      TEST_SCHEMA.tables.orders.fields.status,
    ],
  } satisfies MetabaseQueryOptions<OrdersTable>;

  const selectedFieldsQueryResult = useMetabaseQuery(selectedFieldsQuery);

  const selectedQueryFieldValue: string | null | undefined =
    selectedFieldsQueryResult.data?.rows[0]?.STATUS;

  void selectedQueryFieldValue;

  const scalarAggregationResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [sum(TEST_SCHEMA.tables.orders.fields.amount)],
  });

  const scalarAggregationValue: RowValue | undefined =
    scalarAggregationResult.data?.rows[0]?.sum;

  void scalarAggregationValue;

  // @ts-expect-error aggregation result rows should not include source fields
  void scalarAggregationResult.data?.rows[0]?.amount;

  const metricResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [TEST_SCHEMA.metrics.revenue],
  });

  const metricAggregationValue = metricResult.data?.rows[0];

  void metricAggregationValue;

  // @ts-expect-error aggregation result rows should not include source fields
  void metricResult.data?.rows[0]?.status;

  const groupedMetricResult = useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [TEST_SCHEMA.metrics.revenue],
    breakouts: [
      breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
        unit: "month",
      }),
    ],
  });

  const groupedMetricBreakoutValue: string | Date | null | undefined =
    groupedMetricResult.data?.rows[0]?.CREATED_AT;

  void groupedMetricBreakoutValue;

  // @ts-expect-error result row keys use returned column names, not schema object keys
  void groupedMetricResult.data?.rows[0]?.createdAt;

  const sortKey: "amount" | "createdAt" = "createdAt";

  type OrdersField =
    (typeof TEST_SCHEMA.tables.orders.fields)[keyof typeof TEST_SCHEMA.tables.orders.fields];

  const sortFields = {
    amount: TEST_SCHEMA.tables.orders.fields.amount,
    createdAt: TEST_SCHEMA.tables.orders.fields.createdAt,
  } satisfies Record<string, OrdersField>;

  useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    orderBys: [orderBy(sortFields[sortKey], "desc")],
  });

  // @ts-expect-error grouped queries must include an explicit aggregation
  useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    breakouts: [
      breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
    ],
  });

  return null;
}

void TypeFixtures;

describe("public query API", () => {
  it("exports the table query DSL from the data-app entrypoint", () => {
    expect(DataApp).toMatchObject({
      aggregations: {
        avg: expect.any(Function),
        count: expect.any(Function),
        distinct: expect.any(Function),
        max: expect.any(Function),
        median: expect.any(Function),
        min: expect.any(Function),
        sum: expect.any(Function),
      },
      breakout: expect.any(Function),
      filter: expect.any(Function),
      orderBy: expect.any(Function),
      useMetabaseQuery: expect.any(Function),
      useMetabaseQueryObject: expect.any(Function),
    });
    expect(DataApp).not.toHaveProperty("count");
    expect(DataApp).not.toHaveProperty("sum");
    expect(DataApp).not.toHaveProperty("resolveDatasetQuery");
  });
});
