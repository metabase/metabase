import { t } from "ttag";
import * as Yup from "yup";

import { getPositiveIntegerSchema } from "metabase/admin/performance/constants/complex";
import type { StrategyData } from "metabase/admin/performance/types";
import { defaultCron } from "metabase/admin/performance/utils";
import { DurationUnit } from "metabase-types/api";

export const durationUnits = new Set(Object.values(DurationUnit).map(String));

const scheduleStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["schedule"]),
  schedule: Yup.string()
    .required(t`A cron expression is required`)
    .default(defaultCron),
});

const durationStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["duration"]),
  duration: getPositiveIntegerSchema().default(24),
  unit: Yup.string().test(
    "is-duration-unit",
    "${path} is not a valid duration",
    value => !!value && durationUnits.has(value),
  ),
});

/** Caching strategies available on EE only */
export const enterpriseOnlyCachingStrategies: Record<string, StrategyData> = {
  schedule: {
    label: t`Schedule: pick when to regularly invalidate the cache`,
    shortLabel: t`Scheduled`,
    validationSchema: scheduleStrategyValidationSchema,
  },
  duration: {
    label: t`Duration: keep the cache for a number of hours`,
    validationSchema: durationStrategyValidationSchema,
    shortLabel: t`Duration`,
  },
};
