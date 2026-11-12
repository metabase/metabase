import { defineAction } from "embedding-sdk-package/hooks/public/use-action/define-action";

import {
  mockDataAppAction,
  mockDataAppActionError,
} from "../lib/public/data-app-actions";

const ORDERS_TABLE = {
  type: "table",
  id: 1,
  fields: {
    id: {
      type: "column",
      fieldId: 100,
      tableId: 1,
      name: "ID",
      slug: "id",
      jsType: "number",
    },
    status: {
      type: "column",
      fieldId: 101,
      tableId: 1,
      name: "STATUS",
      slug: "status",
      jsType: "string",
    },
  },
} as const;

const CREATE_ORDER = defineAction({
  entityId: "createOrderEntity",
  kind: "row/create",
  table: ORDERS_TABLE,
});

const UPDATE_ORDER = defineAction({
  entityId: "updateOrderEntity",
  kind: "row/update",
  table: ORDERS_TABLE,
});

const createOrder = mockDataAppAction(CREATE_ORDER, {
  "created-row": { id: 1 },
});

// @ts-expect-error `status` is `string | null | undefined`, not a number
export const status: number | undefined =
  createOrder.lastCall()?.parameters.status;

// @ts-expect-error a table create returns `created-row`, not `rows-updated`
mockDataAppAction(CREATE_ORDER, { "rows-updated": 1 });

// @ts-expect-error `note` is not a column of the action's table
mockDataAppActionError(CREATE_ORDER, { errors: { note: "Too long" } });

mockDataAppAction(UPDATE_ORDER, { "rows-updated": 1 });

// @ts-expect-error a table update returns a count of rows
mockDataAppAction(UPDATE_ORDER, { "rows-updated": [1] });
