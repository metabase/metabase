import dayjs from "dayjs";
import { useMemo } from "react";
import { t } from "ttag";

import type { DateFilterValue } from "metabase/querying/common/types";
import type {
  CardMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";
import { createMockCard } from "metabase-types/api/mocks";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import {
  type StatsFilters,
  type UsageStatsMetric,
  applyDateFilter,
  applyGroupIdFilter,
  applyUsageStatsAggregation,
  applyUserFilter,
  findColumn,
  getMetricSeriesSettings,
  joinGroupMembers,
} from "./query-utils";

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

type Props = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  onDimensionClick?: (value: unknown) => void;
};

export function ConversationsByDayChart({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  onDimensionClick,
}: Props) {
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
      metric,
      bucketName,
    ],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(
    () => toTimeseriesRawSeries(data, jsQuery, metric),
    [data, jsQuery, metric],
  );

  return (
    <BreakoutChartCard
      title={TITLES[bucketName][metric]}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="area"
      h={350}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
}

type BuildQueryOpts = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  bucketName: BucketName;
};

function buildTimeseriesBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  bucketName,
}: BuildQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyUserFilter(q, userId);
  q = groupId != null ? joinGroupMembers(q, groupMembersTable) : q;
  q = groupId != null ? applyGroupIdFilter(q, groupId) : q;
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
) {
  if (!data?.data || !jsQuery) {
    return null;
  }
  const cols = data.data.cols as Array<{ source?: string; name?: string }>;
  const aggregationColumnNames = cols
    .filter((c) => c.source === "aggregation")
    .map((c) => c.name ?? "");
  const isMultiSeriesTokens =
    metric === "tokens" && aggregationColumnNames.length === 2;
  return [
    {
      card: createMockCard({
        dataset_query: jsQuery as any,
        display: isMultiSeriesTokens ? "line" : "area",
        visualization_settings: {
          "graph.x_axis.scale": "timeseries",
          "graph.x_axis.title_text": "",
          "graph.y_axis.title_text": "",
          "line.interpolate": "cardinal",
          "line.marker_enabled": false,
          ...getMetricSeriesSettings(metric, aggregationColumnNames, {
            dualAxis: true,
          }),
        },
      }),
      data: data.data,
    },
  ];
}
