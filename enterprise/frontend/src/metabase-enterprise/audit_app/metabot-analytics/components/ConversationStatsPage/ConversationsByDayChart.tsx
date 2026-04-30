import dayjs from "dayjs";
import { useMemo } from "react";
import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";
import { Skeleton, useMantineTheme } from "metabase/ui";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import {
  type GetColor,
  type StatsFilters,
  type UsageStatsMetric,
  applyDateFilter,
  applyIdFilter,
  applyUsageStatsAggregation,
  findColumn,
  getMetricSeriesSettings,
  joinGroupMembers,
} from "./query-utils";
import {
  type ChartDataSources,
  type ChartInnerProps,
  type ChartProps,
  DEFAULT_CHART_HEIGHT,
} from "./types";

type BucketName = "day" | "hour";

export function isSingleDayFilter(dateFilter: DateFilterValue): boolean {
  if (dateFilter.type === "relative") {
    return dateFilter.unit === "day" && Math.abs(dateFilter.value) <= 1;
  }
  if (dateFilter.type === "specific" && !dateFilter.hasTime) {
    const { operator, values } = dateFilter;
    if (operator === "=") {
      return true;
    }
    if (operator === "between") {
      return dayjs(values[0]).isSame(values[1], "day");
    }
  }
  return false;
}

const TITLES: Record<BucketName, Record<UsageStatsMetric, string>> = {
  day: {
    get conversations() {
      return t`Conversations by day`;
    },
    get messages() {
      return t`Messages by day`;
    },
    get tokens() {
      return t`Tokens by day`;
    },
  },
  hour: {
    get conversations() {
      return t`Conversations by hour`;
    },
    get messages() {
      return t`Messages by hour`;
    },
    get tokens() {
      return t`Tokens by hour`;
    },
  },
};

export function ConversationsByDayChart({
  provider,
  table,
  groupMembersTable,
  h = DEFAULT_CHART_HEIGHT,
  ...rest
}: ChartProps) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <ConversationsByDayChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function ConversationsByDayChartInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  metric,
  onDimensionClick,
  h,
}: ChartInnerProps) {
  const bucketName: BucketName = isSingleDayFilter(dateFilter) ? "hour" : "day";

  const query = useMemo(
    () =>
      buildTimeseriesBreakoutQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
        metric,
        bucketName,
      }),
    [
      provider,
      table,
      groupMembersTable,
      dateFilter,
      userId,
      groupId,
      tenantId,
      metric,
      bucketName,
    ],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);
  const { themeColor } = useMantineTheme().fn;

  const rawSeries = useMemo(
    () => toTimeseriesRawSeries(data, jsQuery, metric, themeColor),
    [data, jsQuery, metric, themeColor],
  );

  return (
    <BreakoutChartCard
      title={TITLES[bucketName][metric]}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="area"
      h={h}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
}

type BuildQueryOpts = StatsFilters &
  ChartDataSources & { bucketName: BucketName };

export function buildTimeseriesBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  metric,
  bucketName,
}: BuildQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyIdFilter(q, "user_id", userId);
  q = applyIdFilter(q, "tenant_id", tenantId);
  q = groupId != null ? joinGroupMembers(q, groupMembersTable) : q;
  q = groupId != null ? applyIdFilter(q, "group_id", groupId) : q;
  q = applyUsageStatsAggregation(q, metric);
  q = breakoutByCreatedAtBucket(q, bucketName);
  return q;
}

function breakoutByCreatedAtBucket(
  query: Query,
  bucketName: BucketName,
): Query {
  const col = findColumn(query, "created_at", Lib.breakoutableColumns);
  if (!col) {
    return query;
  }
  const bucket = Lib.availableTemporalBuckets(query, 0, col).find((b) => {
    return Lib.displayInfo(query, 0, b).shortName === bucketName;
  });
  const bucketed = bucket ? Lib.withTemporalBucket(col, bucket) : col;
  return Lib.breakout(query, 0, bucketed);
}

function toTimeseriesRawSeries(
  data: ReturnType<typeof useAdhocBreakoutQuery>["data"],
  jsQuery: ReturnType<typeof useAdhocBreakoutQuery>["jsQuery"],
  metric: UsageStatsMetric,
  getColor: GetColor,
) {
  if (!data?.data || !jsQuery) {
    return null;
  }

  const aggregationColumnNames = data.data.cols
    .filter((c) => c.source === "aggregation")
    .map((c) => c.name);
  const isMultiSeriesTokens =
    metric === "tokens" && aggregationColumnNames.length === 2;

  return [
    {
      data: data.data,
      card: {
        dataset_query: jsQuery,
        display: isMultiSeriesTokens ? "line" : "area",
        visualization_settings: {
          "graph.x_axis.scale": "timeseries",
          "graph.x_axis.title_text": "",
          "graph.y_axis.title_text": "",
          "line.interpolate": "cardinal",
          ...getMetricSeriesSettings(metric, getColor, aggregationColumnNames, {
            dualAxis: true,
          }),
        },
      },
    },
  ];
}
