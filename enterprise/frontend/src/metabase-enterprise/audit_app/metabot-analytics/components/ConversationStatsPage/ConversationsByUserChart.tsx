import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton } from "metabase/ui";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import { toBreakoutRawSeries } from "./breakout-raw-series";
import { type UsageStatsMetric, buildSourceBreakoutQuery } from "./query-utils";
import type { ChartInnerProps, ChartProps } from "./types";

const TITLES: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Users with most conversations`;
  },
  get messages() {
    return t`Users with most messages`;
  },
  get tokens() {
    return t`Users with most tokens`;
  },
};

export function ConversationsByUserChart({
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
    <ConversationsByUserChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function ConversationsByUserChartInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  onDimensionClick,
  h,
}: ChartInnerProps) {
  const query = useMemo(
    () =>
      buildSourceBreakoutQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        metric,
        breakoutColumn: "user_display_name",
      }),
    [provider, table, groupMembersTable, dateFilter, userId, groupId, metric],
  );

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
