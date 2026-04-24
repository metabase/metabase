import { useMemo } from "react";
import { t } from "ttag";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";
import { createMockCard } from "metabase-types/api/mocks";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import {
  type StatsFilters,
  applyDateFilter,
  applyGroupIdFilter,
  applyUsageStatsAggregation,
  applyUserFilter,
  findColumn,
  getChartTitle,
  getMetricSeriesSettings,
  isSingleDayFilter,
  joinGroupMembers,
} from "./query-utils";

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
  const otherLabel = t`Other`;
  const bucketName = isSingleDayFilter(dateFilter) ? "hour" : "day";

  const query = useMemo(() => {
    let q = Lib.queryFromTableOrCardMetadata(provider, table);

    q = applyDateFilter(q, dateFilter);
    q = applyUserFilter(q, userId);
    if (groupId != null) {
      q = joinGroupMembers(q, groupMembersTable);
      q = applyGroupIdFilter(q, groupId);
    }

    q = applyUsageStatsAggregation(q, metric);

    const createdAtCol = findColumn(q, "created_at", Lib.breakoutableColumns);
    if (createdAtCol) {
      const buckets = Lib.availableTemporalBuckets(q, 0, createdAtCol);
      const matchedBucket = buckets.find((bucket) => {
        const info = Lib.displayInfo(q, 0, bucket);
        return info.shortName === bucketName;
      });
      const bucketed = matchedBucket
        ? Lib.withTemporalBucket(createdAtCol, matchedBucket)
        : createdAtCol;
      q = Lib.breakout(q, 0, bucketed);
    }

    return q;
  }, [
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    metric,
    bucketName,
  ]);

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  // ConversationsByDayChart needs custom timeseries options that toBreakoutRawSeries
  // doesn't model (line vs area, dual-axis tokens, x-axis as timeseries) — so the
  // rawSeries shape is built inline rather than going through the shared helper.
  const rawSeries = useMemo(() => {
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
  }, [data, jsQuery, metric]);

  return (
    <BreakoutChartCard
      title={getChartTitle(metric, bucketName)}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="area"
      h={350}
      otherLabel={otherLabel}
      onDimensionClick={onDimensionClick}
    />
  );
}
