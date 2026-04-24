import { useMemo } from "react";
import { t } from "ttag";

import type {
  CardMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import * as Lib from "metabase-lib";

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
  excludeAllUsersGroup,
  getChartTitle,
  joinGroupMembers,
} from "./query-utils";

function breakoutByJoinedGroupName(query: Query): Query {
  const col = Lib.breakoutableColumns(query, 0).find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    return info.name === "group_name" && info.isFromJoin;
  });
  return col ? Lib.breakout(query, 0, col) : query;
}

type Props = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
};

export function ConversationsByGroupChart({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  onDimensionClick,
  h = 350,
}: Props) {
  const query = useMemo(() => {
    let q = Lib.queryFromTableOrCardMetadata(provider, table);
    q = applyDateFilter(q, dateFilter);
    q = applyUserFilter(q, userId);
    q = joinGroupMembers(q, groupMembersTable);
    q = excludeAllUsersGroup(q);
    q = applyGroupIdFilter(q, groupId);
    q = applyUsageStatsAggregation(q, metric);
    q = breakoutByJoinedGroupName(q);
    q = applyMetricOrderBy(q, metric);
    return q;
  }, [provider, table, groupMembersTable, dateFilter, userId, groupId, metric]);

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(
    () =>
      toBreakoutRawSeries(data, jsQuery, {
        metric,
        display: "row",
        maxCategories: 8,
        otherLabel: t`Other`,
      }),
    [data, jsQuery, metric],
  );

  return (
    <BreakoutChartCard
      title={getChartTitle(metric, "group")}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="row"
      h={h}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
}
