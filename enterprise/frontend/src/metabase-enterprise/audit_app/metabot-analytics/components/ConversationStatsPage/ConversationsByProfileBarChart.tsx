import { useMemo } from "react";
import { t } from "ttag";

import { renderMetabotProfileLabel } from "metabase/metabot/constants";
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
    return t`Conversations by profile`;
  },
  get messages() {
    return t`Messages by profile`;
  },
  get tokens() {
    return t`Tokens by profile`;
  },
};

type Props = StatsFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  onDimensionClick?: (value: unknown) => void;
};

export function ConversationsByProfileBarChart({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  metric,
  onDimensionClick,
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
        breakoutColumn: "profile_id",
      }),
    [provider, table, groupMembersTable, dateFilter, userId, groupId, metric],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(
    () =>
      toBreakoutRawSeries(data, jsQuery, {
        metric,
        display: "bar",
        maxCategories: 8,
        otherLabel: t`Other`,
        transformDimension: renderMetabotProfileLabel,
      }),
    [data, jsQuery, metric],
  );

  return (
    <BreakoutChartCard
      title={TITLES[metric]}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="bar"
      h={350}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
}
