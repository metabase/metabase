/* eslint-disable import/order */

import { TEST_SCHEMA } from "./fixtures";

import type { RowValue } from "../../data-schema";

import type { MetabaseCard } from "metabase/embedding-sdk/types/question";

import type { MetabaseQueryOptions, UseMetabaseQueryObjectResult } from "..";
import { breakout, orderBy, sum, useMetabaseQuery } from "..";

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];

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

  return null;
}

void ValidTypeFixtures;
