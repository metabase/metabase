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
  type UsageStatsMetric,
  applyDateFilter,
  applyGroupIdFilter,
  applyMetricOrderBy,
  applyUsageStatsAggregation,
  applyUserFilter,
  findColumn,
  joinGroupMembers,
} from "./query-utils";

// matches the view's own group_name subquery (WHERE pg.id != 1) so a
// by-group breakout isn't dominated by an All Users bar
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
