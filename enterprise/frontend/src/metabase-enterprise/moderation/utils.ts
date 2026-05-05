import { t } from "ttag";

import type { Card } from "metabase-types/api";

export const getVerifyCardTitle = (card: Card): string => {
  const type = card.type;

  if (type === "question") {
    return t`Verify this question`;
  }

  if (type === "model") {
    return t`Verify this model`;
  }

  if (type === "metric") {
    return t`Verify this metric`;
  }

  throw new Error(`Unknown question.type(): ${type}`);
};
