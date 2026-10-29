import {
  aggregations,
  filter,
} from "embedding-sdk-package/hooks/public/use-metabase-query";
import { defineQuery } from "embedding-sdk-package/hooks/public/use-metabase-query/define-query";

import {
  mockDataAppQuery,
  mockDataAppQueryError,
} from "../lib/public/data-app-queries";

const ORDERS_QUERY = defineQuery({
  source: {
    type: "card",
    entityId: "ordersQuestionEntity",
    name: "Orders list",
    columns: [
      { type: "column", name: "id", displayName: "ID", jsType: "number" },
      {
        type: "column",
        name: "status",
        displayName: "Status",
        jsType: "string",
      },
      { type: "column", name: "total", displayName: "Total", jsType: "number" },
    ],
  },
});

const REFUNDED_ORDERS = {
  filters: [filter({ type: "column", name: "status" }, "=", "refunded")],
} as const;

const ORDERS_BY_STATUS = {
  breakouts: [{ type: "column", name: "status" }],
  aggregations: [aggregations.count()],
} as const;

// @ts-expect-error `unknown` is not a column of the query
mockDataAppQuery(ORDERS_QUERY, [{ unknown: 1 }]);

// @ts-expect-error `id` is a number
mockDataAppQuery(ORDERS_QUERY, [{ id: "1" }]);

mockDataAppQuery(ORDERS_QUERY, ORDERS_BY_STATUS, [
  // @ts-expect-error grouped rows have only the breakout and aggregation columns
  { status: "paid", total: 1 },
]);

mockDataAppQuery(
  ORDERS_QUERY,
  // @ts-expect-error breakouts need aggregations
  { breakouts: [{ type: "column", name: "status" }] },
  [],
);

// @ts-expect-error an error with a dynamic part needs the error argument
mockDataAppQueryError(ORDERS_QUERY, REFUNDED_ORDERS);
