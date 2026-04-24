import { useMemo } from "react";
import { t } from "ttag";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import { createMockCard } from "metabase-types/api/mocks";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import {
  type StatsFilters,
  type UsageStatsMetric,
  buildTimeseriesBreakoutQuery,
  getChartTitle,
  getMetricSeriesSettings,
  isSingleDayFilter,
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
  const bucketName = isSingleDayFilter(dateFilter) ? "hour" : "day";

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
        breakoutColumn: "created_at",
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
      title={getChartTitle(metric, bucketName)}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="area"
      h={350}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
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
