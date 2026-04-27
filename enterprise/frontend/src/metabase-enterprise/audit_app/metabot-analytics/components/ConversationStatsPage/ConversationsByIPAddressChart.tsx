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
    return t`IP addresses with most conversations`;
  },
  get messages() {
    return t`IP addresses with most messages`;
  },
  get tokens() {
    return t`IP addresses with most tokens`;
  },
};

export function ConversationsByIPAddressChart({
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
    <ConversationsByIPAddressChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function ConversationsByIPAddressChartInner({
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
        breakoutColumn: "ip_address",
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
        nullLabel: t`Unknown`,
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
