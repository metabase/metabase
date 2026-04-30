import { t } from "ttag";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";

import {
  type FilterUrlState,
  filterUrlStateConfig,
  mergeUrlStateConfig,
} from "../ConversationFilters/url-state";

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

type StatsPageUrlState = {
  metric: UsageStatsMetric;
};

export type StatsUrlState = FilterUrlState & StatsPageUrlState;

const DEFAULT_METRIC: UsageStatsMetric = "conversations";

function parseMetric(param: QueryParam): UsageStatsMetric {
  const value = getFirstParamValue(param);
  if (value === "messages" || value === "tokens") {
    return value;
  }
  return DEFAULT_METRIC;
}

const statsPageUrlStateConfig: UrlStateConfig<StatsPageUrlState> = {
  parse: (query) => ({
    metric: parseMetric(query.metric),
  }),
  serialize: ({ metric }) => ({
    metric: metric === DEFAULT_METRIC ? undefined : metric,
  }),
};

export const statsUrlStateConfig: UrlStateConfig<StatsUrlState> =
  mergeUrlStateConfig(filterUrlStateConfig, statsPageUrlStateConfig);
