import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton, useMantineTheme } from "metabase/ui";
import type { Query } from "metabase-lib";

import { useAdhocBreakoutQuery } from "../../hooks/useAdhocBreakoutQuery";

import { BreakoutChartCard } from "./BreakoutChartCard";
import {
  mapBreakoutDimension,
  toBreakoutRawSeries,
} from "./breakout-raw-series";
import type { StatsFilters, UsageStatsMetric } from "./query-utils";
import {
  type ChartDataSources,
  type ChartInnerProps,
  type ChartProps,
  DEFAULT_CHART_HEIGHT,
} from "./types";

type BuildQueryFn = (opts: StatsFilters & ChartDataSources) => Query;

type Props = ChartProps & {
  titles: Record<UsageStatsMetric, string>;
  display: "row" | "bar";
  buildQuery: BuildQueryFn;
  labelMapper?: (value: unknown) => unknown;
  maxCategories?: number;
};

type InnerProps = ChartInnerProps & {
  titles: Record<UsageStatsMetric, string>;
  display: "row" | "bar";
  buildQuery: BuildQueryFn;
  labelMapper?: (value: unknown) => unknown;
  maxCategories: number;
};

export function BreakoutChart({
  provider,
  table,
  groupMembersTable,
  h = DEFAULT_CHART_HEIGHT,
  maxCategories = 8,
  ...rest
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <BreakoutChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      maxCategories={maxCategories}
      {...rest}
    />
  );
}

function BreakoutChartInner({
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
  titles,
  display,
  buildQuery,
  labelMapper,
  maxCategories,
}: InnerProps) {
  const query = useMemo(
    () =>
      buildQuery({
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
      buildQuery,
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

  const rawSeries = useMemo(() => {
    const labeled = labelMapper
      ? mapBreakoutDimension(data, labelMapper)
      : data;
    return toBreakoutRawSeries(labeled, jsQuery, {
      metric,
      display,
      maxCategories,
      otherLabel: t`Other`,
      getColor: themeColor,
    });
  }, [data, jsQuery, labelMapper, metric, display, maxCategories, themeColor]);

  return (
    <BreakoutChartCard
      title={titles[metric]}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display={display}
      h={h}
      otherLabel={t`Other`}
      onDimensionClick={onDimensionClick}
    />
  );
}
