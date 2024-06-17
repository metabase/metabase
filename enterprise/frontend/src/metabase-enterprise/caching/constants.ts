import { t } from "ttag";
import * as Yup from "yup";

import { positiveInteger } from "metabase/admin/performance/constants/complex";
import type { StrategyData } from "metabase/admin/performance/types";
import { defaultCron } from "metabase/admin/performance/utils";
import { CacheDurationUnit } from "metabase-types/api";

export const durationUnits = new Set(
  Object.values(CacheDurationUnit).map(String),
);

const scheduleStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["schedule"]),
  schedule: Yup.string()
    .required(t`A cron expression is required`)
    .default(defaultCron),
});

const durationStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["duration"]),
  duration: positiveInteger.default(24),
  unit: Yup.string().test(
    "is-duration-unit",
    "${path} is not a valid duration",
    value => !!value && durationUnits.has(value),
  ),
});

export const enterpriseOnlyCachingStrategies: Record<string, StrategyData> = {
  schedule: {
    label: t`Schedule: pick when to regularly invalidate the cache`,
    shortLabel: t`Scheduled`,
    validateWith: scheduleStrategyValidationSchema,
  },
  duration: {
    label: t`Duration: keep the cache for a number of hours`,
    validateWith: durationStrategyValidationSchema,
    shortLabel: t`Duration`,
  },
};
