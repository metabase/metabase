import { useMemo } from "react";
import { memoize } from "underscore";

import { explainCronExpressionLowercase } from "metabase/lib/cron";
import { Text, type TextProps } from "metabase/ui";
import { t } from "ttag";

interface ScheduleExplanationProps {
  cronExpression: string;
}

export const getScheduleExplanation = memoize(
  (cronExpression: string): string | null => {
    try {
      const readableSchedule = explainCronExpressionLowercase(cronExpression);
      return readableSchedule;
    } catch {
      return null;
    }
  },
);

export function CustomScheduleExplainer({
  cronExpression,
  ...props
}: ScheduleExplanationProps & TextProps) {
  const explanation = useMemo(
    () =>
      t`We will refresh your models ${getScheduleExplanation(cronExpression)}`,
    [cronExpression],
  );

  if (!explanation) {
    return null;
  }

  return <Text {...props}>{explanation}</Text>;
}
