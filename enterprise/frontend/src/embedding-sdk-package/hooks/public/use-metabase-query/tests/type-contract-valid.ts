/* eslint-disable import/order */

import { TEST_SCHEMA } from "./fixtures";

import type { RowValue } from "../../data-schema";

import type { MetabaseCard } from "metabase/embedding-sdk/types/question";

import type { MetabaseQueryOptions, UseMetabaseQueryObjectResult } from "..";
import {
  breakout,
  count,
  filter,
  orderBy,
  sum,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "..";
import { defineQuery } from "../../../../data-app";

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];
type OrdersQuestion = (typeof TEST_SCHEMA)["questions"]["ordersQuestion"];

const revenueQuery = defineQuery({
  savedQuestionSourceId: 54,
  source: TEST_SCHEMA.tables.orders,
  limit: 10,
});

const _savedQuestionSourceId: 54 = revenueQuery.savedQuestionSourceId;
const _queryLimit: 10 = revenueQuery.limit;

// --------
// Compile-time contracts that must pass type-checking.
//
// IMPORTANT: Only include type constructs that are not already covered by unit tests.
// If the usage pattern is already covered by a unit test, do not add it here.
//
// Enforced by the TypeScript compiler.
// These fixtures never run.
// --------

const _validCardQuery = {
  query: {
    "lib/type": "mbql/query",
    database: 1,
    stages: [],
  },
} satisfies MetabaseCard;

// Only this value's type is used to verify the hook result can populate a card.
const hookResult = {} as UseMetabaseQueryObjectResult;
const _validHookResultCard = {
  query: hookResult.query,
} satisfies MetabaseCard;

function ValidTypeFixtures() {
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

  const groupedQuestionQuery = {
    source: TEST_SCHEMA.questions.ordersQuestion,
    filters: [
      filter(TEST_SCHEMA.questions.ordersQuestion.columns[0], "=", "paid"),
    ],
    aggregations: [count()],
    breakouts: [TEST_SCHEMA.questions.ordersQuestion.columns[0]],
    limit: 10,
  } satisfies MetabaseQueryOptions<OrdersQuestion>;

  const groupedQuestionResult = useMetabaseQuery(groupedQuestionQuery);

  // Grouping replaces the question's result columns with the query's own.
  const groupedQuestionCount: number | null | undefined =
    groupedQuestionResult.data?.rows[0]?.count;

  void groupedQuestionCount;

  // `useMetabaseQueryObject` takes no generic, so it must accept both sources.
  useMetabaseQueryObject({
    source: TEST_SCHEMA.questions.ordersQuestion,
    filters: [
      filter(TEST_SCHEMA.questions.ordersQuestion.columns[1], ">", 100),
    ],
  });

  // Apps without a generated schema name the question's result column by hand.
  useMetabaseQueryObject({
    source: { type: "card", id: 41 },
    filters: [filter({ type: "column", name: "STATUS" }, "=", "paid")],
  });

  useMetabaseQuery({
    source: { type: "card", id: 41 },
    filters: [filter({ type: "column", name: "STATUS" }, "=", "paid")],
    aggregations: [count()],
    breakouts: [
      breakout(
        { type: "column", name: "CREATED_AT", jsType: "Date" },
        { unit: "month" },
      ),
    ],
    orderBys: [
      orderBy({ type: "column", name: "CREATED_AT", jsType: "Date" }, "desc", {
        unit: "month",
      }),
    ],
  });

  // A static query published as a card, with dynamic clauses layered on top.
  const staticQuery = {
    source: TEST_SCHEMA.tables.orders,
    savedQuestionSourceId: 41,
  } satisfies MetabaseQueryOptions<OrdersTable>;

  const dynamicResult = useMetabaseQuery(staticQuery, {
    filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
    aggregations: [count()],
    breakouts: [TEST_SCHEMA.tables.orders.fields.status],
  });

  // Grouping in the dynamic stage re-keys the result rows.
  const dynamicCount: number | null | undefined =
    dynamicResult.data?.rows[0]?.count;

  void dynamicCount;

  // Filtering alone leaves the static query's rows in place.
  const filteredResult = useMetabaseQuery(staticQuery, {
    filters: [filter(TEST_SCHEMA.tables.orders.fields.status, "=", "paid")],
  });

  const filteredStatus: string | null | undefined =
    filteredResult.data?.rows[0]?.STATUS;

  void filteredStatus;

  useMetabaseQueryObject(staticQuery, { limit: 10 });

  return null;
}

void ValidTypeFixtures;
