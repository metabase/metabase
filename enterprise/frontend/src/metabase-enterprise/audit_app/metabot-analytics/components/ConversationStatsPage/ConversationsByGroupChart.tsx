import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton, useMantineTheme } from "metabase/ui";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import { toBreakoutRawSeries } from "./breakout-raw-series";
import {
  type UsageStatsMetric,
  applyDateFilter,
  applyGroupIdFilter,
  applyIdFilter,
  applyMetricOrderBy,
  applyUsageStatsAggregation,
  findColumn,
  joinGroupMembers,
} from "./query-utils";
import type { ChartInnerProps, ChartProps } from "./types";

const TITLES: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Groups with most conversations`;
  },
  get messages() {
    return t`Groups with most messages`;
  },
  get tokens() {
    return t`Groups with most tokens`;
  },
};

export function excludeAllUsersGroup(query: Query): Query {
  const col = findColumn(query, "group_id", Lib.filterableColumns);
  if (!col) {
    return query;
  }
  return Lib.filter(
    query,
    0,
    Lib.numberFilterClause({ operator: "!=", column: col, values: [1] }),
  );
}

function breakoutByJoinedGroupName(query: Query): Query {
  const col = Lib.breakoutableColumns(query, 0).find((col) => {
    const info = Lib.displayInfo(query, 0, col);
    return info.name === "group_name" && info.isFromJoin;
  });
  return col ? Lib.breakout(query, 0, col) : query;
}

export function ConversationsByGroupChart({
  provider,
  table,
  groupMembersTable,
  h = 350,
  ...rest
}: ChartProps) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <ConversationsByGroupChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function ConversationsByGroupChartInner({
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
  const query = useMemo(() => {
    let q = Lib.queryFromTableOrCardMetadata(provider, table);
    q = applyDateFilter(q, dateFilter);
    q = applyIdFilter(q, "user_id", userId);
    q = applyIdFilter(q, "tenant_id", tenantId);
    q = joinGroupMembers(q, groupMembersTable);
    q = excludeAllUsersGroup(q);
    q = applyGroupIdFilter(q, groupId);
    q = applyUsageStatsAggregation(q, metric);
    q = breakoutByJoinedGroupName(q);
    q = applyMetricOrderBy(q, metric);
    return q;
  }, [
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
    metric,
  ]);

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);
  const { themeColor } = useMantineTheme().fn;

  const rawSeries = useMemo(
    () =>
      toBreakoutRawSeries(data, jsQuery, {
        metric,
        display: "row",
        maxCategories: 8,
        otherLabel: t`Other`,
        getColor: themeColor,
      }),
    [data, jsQuery, metric, themeColor],
  );

  return (
    <BreakoutChartCard
      title={TITLES[metric]}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="row"
      h={h}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
}
