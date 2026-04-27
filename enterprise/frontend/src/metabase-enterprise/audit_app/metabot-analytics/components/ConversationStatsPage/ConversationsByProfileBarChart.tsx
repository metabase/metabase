import { useMemo } from "react";
import { t } from "ttag";

import { renderMetabotProfileLabel } from "metabase/metabot/constants";
import { Skeleton } from "metabase/ui";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import {
  mapBreakoutDimension,
  toBreakoutRawSeries,
} from "./breakout-raw-series";
import { type UsageStatsMetric, buildSourceBreakoutQuery } from "./query-utils";
import type { ChartInnerProps, ChartProps } from "./types";

const TITLES: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Conversations by profile`;
  },
  get messages() {
    return t`Messages by profile`;
  },
  get tokens() {
    return t`Tokens by profile`;
  },
};

export function ConversationsByProfileBarChart({
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
    <ConversationsByProfileBarChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function ConversationsByProfileBarChartInner({
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
        breakoutColumn: "profile_id",
      }),
    [provider, table, groupMembersTable, dateFilter, userId, groupId, metric],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(() => {
    const labeledData = mapBreakoutDimension(data, (value) =>
      typeof value === "string" ? renderMetabotProfileLabel(value) : value,
    );
    return toBreakoutRawSeries(labeledData, jsQuery, {
      metric,
      display: "bar",
      maxCategories: 8,
      otherLabel: t`Other`,
    });
  }, [data, jsQuery, metric]);

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
