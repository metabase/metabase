import { defineAction } from "embedding-sdk-package/hooks/public/use-action/define-action";

import { mockAction, mockActionError } from "../mock-action";

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

const refund = mockAction(REFUND_ORDER, { "rows-affected": 1 });

// @ts-expect-error `reason` is `string | null | undefined`, not a number
export const reason: number | undefined = refund.lastCall()?.parameters.reason;

// @ts-expect-error a query action returns `rows-affected`, not `created-row`
mockAction(REFUND_ORDER, { "created-row": { id: 1 } });

// @ts-expect-error `note` is not a parameter of the action
mockActionError(REFUND_ORDER, { errors: { note: "Too long" } });
