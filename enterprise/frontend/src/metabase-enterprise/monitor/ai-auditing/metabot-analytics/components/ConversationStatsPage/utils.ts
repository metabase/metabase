import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";

import type { UsageStatsMetric } from "./query-utils";

export function getFilterDays(dateValue: string): number {
  const parsed = deserializeDateParameterValue(dateValue);
  if (parsed?.type === "relative" && parsed.value < 0) {
    return Math.abs(parsed.value);
  }
  return 30;
}

export const DEFAULT_USAGE_STATS_METRIC: UsageStatsMetric = "conversations";

const USAGE_STATS_METRICS: readonly UsageStatsMetric[] = [
  "conversations",
  "tokens",
  "messages",
];

export function parseUsageStatsMetric(
  value: string | undefined,
): UsageStatsMetric | undefined {
  return USAGE_STATS_METRICS.find((metric) => metric === value);
}
