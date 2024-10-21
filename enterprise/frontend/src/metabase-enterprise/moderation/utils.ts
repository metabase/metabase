import { t } from "ttag";

import type Question from "metabase-lib/v1/Question";
import { Dashboard, entityIsDashboard } from "metabase-types/api";

export const getVerifyQuestionTitle = (
  question: Question | Dashboard,
): string => {
  const type = entityIsDashboard(question) ? "dashboard" : question.type();

  if (type === "dashboard") {
    return t`Verify this dashboard`;
  }

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
