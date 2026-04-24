import { useMemo } from "react";
import { t } from "ttag";

import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import { toBreakoutRawSeries } from "./breakout-raw-series";
import {
  type StatsFilters,
  type UsageStatsMetric,
  buildSourceBreakoutQuery,
} from "./query-utils";

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

type Props = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  onDimensionClick?: (value: unknown) => void;
  h?: number;
};

export function ConversationsByUserChart({
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
