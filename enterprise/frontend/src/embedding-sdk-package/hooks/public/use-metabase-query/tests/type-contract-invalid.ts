// oxfmt-ignore
import { TEST_SCHEMA } from "./fixtures";

// oxfmt-ignore
import type { MetabaseCard } from "metabase/embedding-sdk/types/question";

// oxfmt-ignore
import type { MetabaseQueryOptions, UseMetabaseQueryObjectResult } from "..";
// oxfmt-ignore
import { breakout, sum, useMetabaseQuery } from "..";

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];
type OrdersQuestion = (typeof TEST_SCHEMA)["questions"]["ordersQuestion"];

// --------
// Compile-time contracts that must **fail** type-checking.
//
// Enforced by the TypeScript compiler.
// These fixtures never run.
// --------

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

const _invalidSavedQuestionClauseQuery = {
  source: TEST_SCHEMA.questions.ordersQuestion,

  // @ts-expect-error saved question queries only support source and enabled
  fields: [TEST_SCHEMA.questions.ordersQuestion.columns[0]],
} satisfies MetabaseQueryOptions<OrdersQuestion>;

// Only this value's type is used to reject passing the entire hook result to a card.
const hookResult = {} as UseMetabaseQueryObjectResult;
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

function InvalidTypeFixtures() {
  const scalarAggregationResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [sum(TEST_SCHEMA.tables.orders.fields.amount)],
  });

  // @ts-expect-error aggregation result rows should not include source fields
  void scalarAggregationResult.data?.rows[0]?.amount;

  const metricResult = useMetabaseQuery({
    source: TEST_SCHEMA.tables.orders,
    aggregations: [TEST_SCHEMA.metrics.revenue],
  });

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

  // @ts-expect-error result row keys use returned column names, not schema object keys
  void groupedMetricResult.data?.rows[0]?.createdAt;

  // @ts-expect-error grouped queries must include an explicit aggregation
  useMetabaseQuery<OrdersTable>({
    source: TEST_SCHEMA.tables.orders,
    breakouts: [
      breakout(TEST_SCHEMA.tables.orders.fields.createdAt, { unit: "month" }),
    ],
  });

  return null;
}

void InvalidTypeFixtures;
