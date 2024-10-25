import { t } from "ttag";

import type Question from "metabase-lib/v1/Question";

export const getVerifyQuestionTitle = (question: Question): string => {
  const type = question.type();

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
