import { t } from "ttag";
import * as Yup from "yup";

import type { StrategyData } from "metabase/admin/performance/strategies";
import { defaultCron } from "metabase/admin/performance/utils";

const scheduleStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["schedule"]),
  schedule: Yup.string()
    .required(t`A cron expression is required`)
    .default(defaultCron),
});

export const extraStrategies: Record<string, StrategyData> = {
  schedule: {
    label: t`Schedule: pick when to regularly invalidate the cache`,
    shortLabel: t`Scheduled`,
    validateWith: scheduleStrategyValidationSchema,
  },
};
