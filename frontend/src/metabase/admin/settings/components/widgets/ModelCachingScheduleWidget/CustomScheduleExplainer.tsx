import { useMemo } from "react";
import { t } from "ttag";

import { explainCronExpression as _explainCronExpression } from "metabase/lib/cron";

import { Description } from "./ModelCachingScheduleWidget.styled";

function lowerCaseFirstLetter(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function explainCronExpression(cronExpression: string) {
  return lowerCaseFirstLetter(_explainCronExpression(cronExpression));
}

function CustomScheduleExplainer({
  cronExpression,
}: {
  cronExpression: string;
}) {
  const explanation = useMemo(() => {
    try {
      const readableSchedule = explainCronExpression(cronExpression);
      return t`We will refresh your models ${lowerCaseFirstLetter(
        readableSchedule,
      )}`;
    } catch {
      return null;
    }
  }, [cronExpression]);

  if (!explanation) {
    return null;
  }

  return <Description>{explanation}</Description>;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomScheduleExplainer;
