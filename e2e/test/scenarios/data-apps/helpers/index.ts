import type { DataAppQuestions, DataAppTestEnv } from "e2e/support/helpers";

/** The `testEnv` function giving the Overview page of the fixture its Orders count and Orders questions. */
export const dataAppTestEnv = ({
  ordersEntityId,
  ordersCountEntityId,
}: DataAppQuestions): DataAppTestEnv => ({
  scalarQuery: {
    source: { type: "card", entityId: ordersCountEntityId },
  },
  questionQuery: {
    source: { type: "card", entityId: ordersEntityId },
  },
});
