import { t } from "ttag";
import * as Yup from "yup";

import { defaultCron } from "metabase/common/components/Schedule/cron";
import {
  PerformanceTabId,
  type StrategyData,
  getPerformanceTabMetadata,
  getPositiveIntegerSchema,
} from "metabase/plugins";
import type { AdminPath } from "metabase/redux/store";
import { CacheDurationUnit } from "metabase-types/api";

export const durationUnits = new Set(
  Object.values(CacheDurationUnit).map(String),
);

const getScheduleStrategyValidationSchema = () =>
  Yup.object({
    type: Yup.string().equals(["schedule"]),
    schedule: Yup.string()
      .required(t`A cron expression is required`)
      .default(defaultCron),
    refresh_automatically: Yup.boolean().nullable().default(false),
  });

const getDurationStrategyValidationSchema = () =>
  Yup.object({
    type: Yup.string().equals(["duration"]),
    duration: getPositiveIntegerSchema().default(24),
    unit: Yup.string().test(
      "is-duration-unit",
      "${path} is not a valid duration",
      (value) => !!value && durationUnits.has(value),
    ),
    refresh_automatically: Yup.boolean().nullable().default(false),
  });

/** Caching strategies available on EE only. Labels are functions so ttag
 * runs after the locale is set (see `StrategyLabel`). */
export const enterpriseOnlyCachingStrategies: Record<string, StrategyData> = {
  schedule: {
    label: () => t`Schedule`,
    description: () => t`Pick when to regularly invalidate the cache`,
    shortLabel: () => t`Scheduled`,
    validationSchema: getScheduleStrategyValidationSchema,
  },
  duration: {
    label: () => t`Duration`,
    description: () => t`Keep the cache for a number of hours`,
    validationSchema: getDurationStrategyValidationSchema,
    shortLabel: () => t`Duration`,
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
