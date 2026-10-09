import type { MetabaseCard } from "metabase/embedding-sdk/types/question";

import type { UseMetabaseQueryObjectResult } from "..";
import {
  aggregations,
  breakout,
  count,
  filter,
  orderBy,
  sum,
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "..";
import { defineAction, defineQuery } from "../../../../data-app";
import type { RowValue } from "../../data-schema";
import { useAction, useDataAppAction } from "../../use-action";

import { TEST_SCHEMA } from "./fixtures";

type OrdersTable = (typeof TEST_SCHEMA)["tables"]["orders"];

const revenueQuery = defineQuery({
  savedQuestionEntityId: "revenueQuestionEntity",
  source: TEST_SCHEMA.tables.orders,
  limit: 10,
});

const _savedQuestionEntityId: "revenueQuestionEntity" =
  revenueQuery.savedQuestionEntityId;
const _queryLimit: 10 = revenueQuery.limit;

const CreateOrder = defineAction({
  copiedActionEntityId: "createOrderCopyEntity",
  action: TEST_SCHEMA.actions.createOrder,
});

const _copiedActionEntityId: "createOrderCopyEntity" =
  CreateOrder.copiedActionEntityId;
const _sourceActionId: 51 = CreateOrder.action.id;

// A definition is valid before its copy is written.
const UpdateOrder = defineAction({
  action: TEST_SCHEMA.actions.updateOrder,
});

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
  // A definition types `execute` and `result` on its own, no generics written.
  const createOrder = useDataAppAction(CreateOrder);

  void createOrder.execute({ status: "shipped" });

  const createdCount: number | undefined =
    createOrder.result?.["rows-affected"];

  void createdCount;

  const updateOrder = useDataAppAction(UpdateOrder);

  void updateOrder.execute({ id: 1 });

  // The SDK hook takes a plain definition object, and a `defineAction` export too.
  const sdkCreateOrder = useAction({
    action: TEST_SCHEMA.actions.createOrder,
  });

  void sdkCreateOrder.execute({ status: "shipped" });
  void useAction(CreateOrder).execute({ status: "shipped" });

  const updatedCount: number | undefined =
    updateOrder.result?.["rows-affected"];

  void updatedCount;

  // A raw id types nothing, so the generics still stand in for a definition.
  const rawAction = useAction<{ status: string }, "create">(51);

  void rawAction.execute({ status: "shipped" });

  const selectedFieldsResult = useMetabaseQuery(
    defineQuery({
      source: TEST_SCHEMA.tables.orders,
      fields: [TEST_SCHEMA.tables.orders.fields.id],
    }),
  );

  const selectedFieldValue: number | null | undefined =
    selectedFieldsResult.data?.rows[0]?.ID;

  void selectedFieldValue;

  const selectedFieldsQuery = defineQuery({
    source: TEST_SCHEMA.tables.orders,
    fields: [
      TEST_SCHEMA.tables.orders.fields.id,
      TEST_SCHEMA.tables.orders.fields.status,
    ],
  });

  const selectedFieldsQueryResult = useMetabaseQuery(selectedFieldsQuery);

  const selectedQueryFieldValue: string | null | undefined =
    selectedFieldsQueryResult.data?.rows[0]?.STATUS;

  void selectedQueryFieldValue;

  const scalarAggregationResult = useMetabaseQuery(
    defineQuery({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [sum(TEST_SCHEMA.tables.orders.fields.amount)],
    }),
  );

  const scalarAggregationValue: RowValue | undefined =
    scalarAggregationResult.data?.rows[0]?.sum;

  void scalarAggregationValue;

  const namedAggregationResult = useMetabaseQuery(
    defineQuery({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [
        count({ name: "orders" }),
        sum(TEST_SCHEMA.tables.orders.fields.amount, { name: "total amount" }),
      ],
    }),
  );

  const namedCountValue: number | null | undefined =
    namedAggregationResult.data?.rows[0]?.orders;
  const namedSumValue: RowValue | undefined =
    namedAggregationResult.data?.rows[0]?.["total amount"];

  void namedCountValue;
  void namedSumValue;

  const namedMeasureResult = useMetabaseQuery(
    defineQuery({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [
        aggregations.measure(TEST_SCHEMA.tables.orders.measures.revenue, {
          name: "revenue",
        }),
        count(),
      ],
    }),
  );

  const namedMeasureValue: number | null | undefined =
    namedMeasureResult.data?.rows[0]?.revenue;

  void namedMeasureValue;

  const namedBreakoutResult = useMetabaseQuery(
    defineQuery({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [count()],
      breakouts: [
        breakout(TEST_SCHEMA.tables.orders.fields.createdAt, {
          unit: "month",
          name: "created_month",
        }),
      ],
    }),
  );

  const namedBreakoutValue: string | Date | null | undefined =
    namedBreakoutResult.data?.rows[0]?.created_month;

  void namedBreakoutValue;

  const groupedMetricResult = useMetabaseQuery(
    defineQuery<OrdersTable>({
      source: TEST_SCHEMA.tables.orders,
      aggregations: [TEST_SCHEMA.metrics.revenue],
      breakouts: [
        breakout(TEST_SCHEMA.metrics.revenue.dimensions.orders.createdAt, {
          unit: "month",
        }),
      ],
    }),
  );

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

  useMetabaseQuery(
    defineQuery({
      source: TEST_SCHEMA.tables.orders,
      orderBys: [orderBy(sortFields[sortKey], "desc")],
    }),
  );

  // A static query published as a card, with dynamic clauses layered on top.
  const staticQuery = defineQuery({
    source: TEST_SCHEMA.tables.orders,
    savedQuestionEntityId: "ordersQuestionEntity1",
  });

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
