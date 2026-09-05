/* eslint-disable import/order */

import { TEST_SCHEMA } from "./fixtures";

import type { MetabaseCard } from "metabase/embedding-sdk/types/question";

import type { MetabaseQueryOptions, UseMetabaseQueryObjectResult } from "..";
import { breakout, count, sum, useMetabaseQuery } from "..";
import { useAction } from "../../use-action";
import { defineAction, defineQuery } from "../../../../data-app";

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];

const queryWithInvalidSavedQuestionSourceId = {
  savedQuestionSourceId: "54",
  source: TEST_SCHEMA.tables.orders,
} as const;

// @ts-expect-error saved-question source IDs are numeric
defineQuery(queryWithInvalidSavedQuestionSourceId);

// @ts-expect-error query definitions with breakouts require aggregations
defineQuery({
  source: TEST_SCHEMA.tables.orders,
  breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.createdAt)],
});

const actionWithInvalidActionSourceId = {
  copiedActionId: "91",
  action: TEST_SCHEMA.models.orders.actions.create,
} as const;

// @ts-expect-error generated action source IDs are numeric
defineAction(actionWithInvalidActionSourceId);

// @ts-expect-error action definitions must reference a generated action
defineAction({ action: TEST_SCHEMA.tables.orders });

const CreateOrder = defineAction({
  action: TEST_SCHEMA.models.orders.actions.create,
});

const UpdateOrder = defineAction({
  action: TEST_SCHEMA.models.orders.actions.update,
});

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

// @ts-expect-error `unit` buckets a date, so only a date dimension offers it
breakout(TEST_SCHEMA.tables.orders.fields.status, { unit: "month" });

function InvalidTypeFixtures() {
  // @ts-expect-error saved-question metadata cannot be passed to querying hooks
  useMetabaseQuery({ source: TEST_SCHEMA.questions.ordersQuestion });

  // @ts-expect-error pass the `defineAction` export, not the schema entry
  useAction(TEST_SCHEMA.models.orders.actions.create);

  // @ts-expect-error the definition's parameter slugs are the only keys
  useAction(CreateOrder).execute({ stauts: "shipped" });

  // @ts-expect-error a parameter value is typed by its `jsType`
  useAction(CreateOrder).execute({ status: 1 });

  // @ts-expect-error required parameters cannot be omitted
  useAction(UpdateOrder).execute({});

  // @ts-expect-error `result` is discriminated by the action's kind
  void useAction(CreateOrder).result?.["rows-updated"];

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

  const staticQuery = {
    source: TEST_SCHEMA.tables.orders,
    savedQuestionSourceId: 41,
  } satisfies MetabaseQueryOptions<OrdersTable>;

  useMetabaseQuery(staticQuery, {
    // @ts-expect-error Segments belong to a table source, so the dynamic stage
    // cannot resolve one. Filter the static query with it instead.
    filters: [TEST_SCHEMA.tables.orders.segments.completed],
  });

  useMetabaseQuery(staticQuery, {
    aggregations: [
      // @ts-expect-error Measures belong to a table source, so the dynamic stage
      // cannot resolve one. Aggregate the static query with it instead.
      TEST_SCHEMA.tables.orders.measures.revenue,
    ],
  });
  // @ts-expect-error grouped dynamic clauses must include an explicit aggregation
  useMetabaseQuery(staticQuery, {
    breakouts: [TEST_SCHEMA.tables.orders.fields.status],
  });

  const groupedDynamicResult = useMetabaseQuery(staticQuery, {
    aggregations: [count()],
    breakouts: [TEST_SCHEMA.tables.orders.fields.status],
  });

  // @ts-expect-error grouping in the dynamic stage drops the source columns
  void groupedDynamicResult.data?.rows[0]?.AMOUNT;

  return null;
}

void InvalidTypeFixtures;
