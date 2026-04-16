import { t } from "ttag";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";

import { DEFAULT_DATE, DEFAULT_GROUP } from "../ConversationFilters";

import type { UsageStatsMetric } from "./query-utils";

export function getDateLabel(value: string | null): string {
  const parsed = value ? deserializeDateParameterValue(value) : undefined;
  return parsed
    ? getDateFilterDisplayName(parsed, { withPrefix: false })
    : t`Date`;
}

export function getFilterDays(dateValue: string): number {
  const parsed = deserializeDateParameterValue(dateValue);
  if (parsed?.type === "relative" && parsed.value < 0) {
    return Math.abs(parsed.value);
  }
  return 30;
}

export type StatsUrlState = {
  date: string | null;
  user: string | null;
  group: string | null;
  metric: UsageStatsMetric;
};

const DEFAULT_METRIC: UsageStatsMetric = "conversations";

function parseString(param: QueryParam): string | null {
  const value = getFirstParamValue(param);
  return value && value.trim().length > 0 ? value.trim() : null;
}

function parseMetric(param: QueryParam): UsageStatsMetric {
  const value = getFirstParamValue(param);
  if (value === "messages" || value === "tokens") {
    return value;
  }
  return DEFAULT_METRIC;
}

export const statsUrlStateConfig: UrlStateConfig<StatsUrlState> = {
  parse: (query) => ({
    date: parseString(query.date) ?? DEFAULT_DATE,
    user: parseString(query.user),
    group: parseString(query.group) ?? DEFAULT_GROUP,
    metric: parseMetric(query.metric),
  }),
  serialize: ({ date, user, group, metric }) => ({
    date: date === DEFAULT_DATE ? undefined : (date ?? undefined),
    user: user ?? undefined,
    group: group === DEFAULT_GROUP ? undefined : (group ?? undefined),
    metric: metric === DEFAULT_METRIC ? undefined : metric,
  }),
};
