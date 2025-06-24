import { useMemo } from "react";
import { t } from "ttag";

import { getScheduleExplanation } from "metabase/lib/cron";
import { Text, type TextProps } from "metabase/ui";

interface ScheduleExplanationProps {
  cronExpression: string;
}

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
