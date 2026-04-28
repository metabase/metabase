import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton, useMantineTheme } from "metabase/ui";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import { toBreakoutRawSeries } from "./breakout-raw-series";
import { type UsageStatsMetric, buildSourceBreakoutQuery } from "./query-utils";
import type { ChartInnerProps, ChartProps } from "./types";

const TITLES: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Conversations by source`;
  },
  get messages() {
    return t`Messages by source`;
  },
  get tokens() {
    return t`Tokens by source`;
  },
};

export function ConversationsBySourceChart({
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
    <ConversationsBySourceChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function ConversationsBySourceChartInner({
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
  const query = useMemo(
    () =>
      buildSourceBreakoutQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
        metric,
        breakoutColumn: "source_name",
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
    ],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);
  const { themeColor } = useMantineTheme().fn;

  const rawSeries = useMemo(
    () =>
      toBreakoutRawSeries(data, jsQuery, {
        metric,
        display: "bar",
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
      display="bar"
      h={h}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
}
