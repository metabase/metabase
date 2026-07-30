import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton } from "metabase/ui";
import type {
  CardMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";

import { BreakoutChartCard } from "../../metabot-analytics/components/ConversationStatsPage/BreakoutChartCard";
import { useAdhocBreakoutQuery } from "../../metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { CliFilters } from "../query-utils";
import { buildCallsByDayByClientQuery } from "../query-utils";
import { toSeriesByBreakoutRawSeries } from "../raw-series";

const CHART_HEIGHT = 320;

type DataSources = {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
};

type BuildQueryFn = (opts: CliFilters & DataSources) => Query;

type Props = CliFilters & {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
  title: string;
  /** Two-breakout (day × series) query builder. Defaults to the day×client breakdown. */
  buildQuery?: BuildQueryFn;
  h?: number;
};

type InnerProps = CliFilters &
  DataSources & {
    title: string;
    buildQuery: BuildQueryFn;
    h: number;
  };

/**
 * Multi-series line chart of calls per day (one line per series — client or status). Renders a
 * skeleton until the audit metadata is loaded, then delegates to the inner component.
 */
export function CliCallsTimelineChart({
  provider,
  table,
  groupMembersTable,
  title,
  buildQuery = buildCallsByDayByClientQuery,
  h = CHART_HEIGHT,
  ...filters
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <CliCallsTimelineChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      title={title}
      buildQuery={buildQuery}
      h={h}
      {...filters}
    />
  );
}

/**
 * Loaded variant of {@link CliCallsTimelineChart}: builds the day×series query, runs it, and
 * renders it as a multi-series line chart through the shared chart card.
 */
function CliCallsTimelineChartInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  title,
  buildQuery,
  h,
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
    ],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);

  const rawSeries = useMemo(
    () => toSeriesByBreakoutRawSeries(data, jsQuery),
    [data, jsQuery],
  );

  return (
    <BreakoutChartCard
      title={title}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display="line"
      h={h}
      otherLabel={t`Other`}
    />
  );
}
