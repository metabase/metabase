import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton, useMantineTheme } from "metabase/ui";
import type { Query } from "metabase-lib";
import * as Lib from "metabase-lib";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import {
  mapBreakoutDimension,
  toBreakoutRawSeries,
} from "./breakout-raw-series";
import {
  type StatsFilters,
  type UsageStatsMetric,
  applyDateFilter,
  applyIdFilter,
  applyMetricOrderBy,
  applyUsageStatsAggregation,
  breakoutByColumn,
  findColumn,
  joinGroupMembers,
} from "./query-utils";
import type { ChartDataSources, ChartInnerProps, ChartProps } from "./types";

const TITLES: Record<UsageStatsMetric, string> = {
  get conversations() {
    return t`Tenants with most conversations`;
  },
  get messages() {
    return t`Tenants with most messages`;
  },
  get tokens() {
    return t`Tenants with most tokens`;
  },
};

type TenantChartProps = ChartProps & {
  tenantOptions: { value: string; label: string }[];
};

type TenantChartInnerProps = ChartInnerProps & {
  tenantOptions: { value: string; label: string }[];
};

export function ConversationsByTenantChart({
  provider,
  table,
  groupMembersTable,
  h = 350,
  ...rest
}: TenantChartProps) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <ConversationsByTenantChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      {...rest}
    />
  );
}

function ConversationsByTenantChartInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  metric,
  tenantOptions,
  onDimensionClick,
  h,
}: TenantChartInnerProps) {
  const query = useMemo(
    () =>
      buildTenantBreakoutQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
        metric,
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

  const tenantNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of tenantOptions) {
      map.set(opt.value, opt.label);
    }
    return map;
  }, [tenantOptions]);

  const rawSeries = useMemo(() => {
    const labeledData = mapBreakoutDimension(data, (value) =>
      value == null
        ? value
        : (tenantNameById.get(String(value)) ?? String(value)),
    );
    return toBreakoutRawSeries(labeledData, jsQuery, {
      metric,
      display: "row",
      maxCategories: 8,
      otherLabel: t`Other`,
      getColor: themeColor,
    });
  }, [data, jsQuery, metric, tenantNameById, themeColor]);

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

type BuildQueryOpts = StatsFilters & ChartDataSources;

function applyTenantNotNullFilter(query: Query): Query {
  const col = findColumn(query, "tenant_id", Lib.filterableColumns);
  if (!col) {
    return query;
  }
  return Lib.filter(query, 0, Lib.expressionClause("not-null", [col], null));
}

function buildTenantBreakoutQuery({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  metric,
}: BuildQueryOpts): Query {
  let q = Lib.queryFromTableOrCardMetadata(provider, table);
  q = applyDateFilter(q, dateFilter);
  q = applyIdFilter(q, "user_id", userId);
  q = applyIdFilter(q, "tenant_id", tenantId);
  q = applyTenantNotNullFilter(q);
  q = groupId != null ? joinGroupMembers(q, groupMembersTable) : q;
  q = groupId != null ? applyIdFilter(q, "group_id", groupId) : q;
  q = applyUsageStatsAggregation(q, metric);
  q = breakoutByColumn(q, "tenant_id");
  q = applyMetricOrderBy(q, metric);
  return q;
}
