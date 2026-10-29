import { defineAction } from "embedding-sdk-package/hooks/public/use-action/define-action";

import {
  mockDataAppAction,
  mockDataAppActionError,
} from "../lib/public/data-app-actions";

const REFUND_ORDER = defineAction({
  action: {
    kind: "action",
    id: "refundOrderEntity",
    name: "Refund order",
    type: "query",
    parameters: [
      { slug: "id", displayName: "ID", jsType: "number", required: true },
      { slug: "reason", displayName: "Reason", jsType: "string" },
    ],
  },
});

const refund = mockDataAppAction(REFUND_ORDER, { "rows-affected": 1 });

// @ts-expect-error `reason` is `string | null | undefined`, not a number
export const reason: number | undefined = refund.lastCall()?.parameters.reason;

// @ts-expect-error a query action returns `rows-affected`, not `created-row`
mockDataAppAction(REFUND_ORDER, { "created-row": { id: 1 } });

// @ts-expect-error `note` is not a parameter of the action
mockDataAppActionError(REFUND_ORDER, { errors: { note: "Too long" } });

const UPDATE_ORDER = defineAction({
  action: {
    kind: "action",
    id: "updateOrderEntity",
    name: "Update order",
    type: "implicit",
    implicitKind: "row/update",
    parameters: [
      { slug: "id", displayName: "ID", jsType: "number", required: true },
      { slug: "status", displayName: "Status", jsType: "string" },
    ],
  },
});

mockDataAppAction(UPDATE_ORDER, { "rows-updated": 1 });

// @ts-expect-error a table update returns `rows-updated`, not `rows-affected`
mockDataAppAction(UPDATE_ORDER, { "rows-affected": 1 });
