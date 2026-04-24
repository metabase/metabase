import { useMemo } from "react";
import { t } from "ttag";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";
import type { VisualizationDisplay } from "metabase-types/api";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import { toBreakoutRawSeries } from "./breakout-raw-series";
import {
  type StatsFilters,
  applyDateFilter,
  applyGroupIdFilter,
  applyMetricOrderBy,
  applyUsageStatsAggregation,
  applyUserFilter,
  findColumn,
  joinGroupMembers,
} from "./query-utils";

type Props = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  breakoutColumn: string;
  title: string;
  display?: VisualizationDisplay;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
  nullLabel?: string;
  maxCategories?: number;
  transformDimension?: (value: string) => string;
};

export function BreakoutChart({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  breakoutColumn,
  title,
  display = "row",
  metric,
  onDimensionClick,
  h = 350,
  nullLabel,
  maxCategories = 8,
  transformDimension,
}: Props) {
  const otherLabel = t`Other`;

  const query = useMemo(() => {
    let q = Lib.queryFromTableOrCardMetadata(provider, table);

    q = applyDateFilter(q, dateFilter);
    q = applyUserFilter(q, userId);
    if (groupId != null) {
      q = joinGroupMembers(q, groupMembersTable);
      q = applyGroupIdFilter(q, groupId);
    }

    q = applyUsageStatsAggregation(q, metric);

    const col = findColumn(q, breakoutColumn, Lib.breakoutableColumns);
    if (col) {
      q = Lib.breakout(q, 0, col);
    }

    q = applyMetricOrderBy(q, metric);

    return q;
  }, [
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    breakoutColumn,
    metric,
  ]);

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(
    () =>
      toBreakoutRawSeries(data, jsQuery, {
        metric,
        display,
        nullLabel,
        transformDimension,
        maxCategories,
        otherLabel,
      }),
    [
      data,
      jsQuery,
      metric,
      display,
      nullLabel,
      transformDimension,
      maxCategories,
      otherLabel,
    ],
  );

  return (
    <BreakoutChartCard
      title={title}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display={display}
      h={h}
      otherLabel={otherLabel}
      onDimensionClick={onDimensionClick}
    />
  );
}
