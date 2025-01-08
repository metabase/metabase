import { t } from "ttag";
import * as Yup from "yup";

import {
  getPerformanceTabMetadata,
  getPositiveIntegerSchema,
} from "metabase/admin/performance/constants/complex";
import {
  PerformanceTabId,
  type StrategyData,
} from "metabase/admin/performance/types";
import { defaultCron } from "metabase/admin/performance/utils";
import { CacheDurationUnit } from "metabase-types/api";
import type { AdminPath } from "metabase-types/store";

export const durationUnits = new Set(
  Object.values(CacheDurationUnit).map(String),
);

const scheduleStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["schedule"]),
  schedule: Yup.string()
    .required(t`A cron expression is required`)
    .default(defaultCron),
  refresh_automatically: Yup.boolean().nullable().default(false),
});

const durationStrategyValidationSchema = Yup.object({
  type: Yup.string().equals(["duration"]),
  duration: getPositiveIntegerSchema().default(24),
  unit: Yup.string().test(
    "is-duration-unit",
    "${path} is not a valid duration",
    value => !!value && durationUnits.has(value),
  ),
  refresh_automatically: Yup.boolean().nullable().default(false),
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

export const getEnterprisePerformanceTabMetadata = () => {
  const metadata = getPerformanceTabMetadata();
  // On EE there is an additional tab in between the "Database caching" and
  // "Model persistence" tabs
  return [
    metadata.find(({ key }) => key === "performance-databases"),
    {
      name: t`Dashboard and question caching`,
      path: "/admin/performance/dashboards-and-questions",
      key: "performance-dashboards-and-questions",
      tabId: PerformanceTabId.DashboardsAndQuestions,
    },
    metadata.find(({ key }) => key === "performance-models"),
  ] as (AdminPath & { tabId: string })[];
};
