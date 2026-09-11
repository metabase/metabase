import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton, useMantineTheme } from "metabase/ui";
import { BreakoutChartCard } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationStatsPage/BreakoutChartCard";
import { useAdhocBreakoutQuery } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { ApiKeyUsageFilters } from "metabase-enterprise/monitor/api-key-usage/query-utils";
import { buildCallsByDayQuery } from "metabase-enterprise/monitor/api-key-usage/query-utils";
import { toCountBreakoutRawSeries } from "metabase-enterprise/monitor/api-key-usage/raw-series";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";

const CHART_HEIGHT = 320;

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type Props = DataSources &
  ApiKeyUsageFilters & {
    title: string;
    h?: number;
  };

type InnerProps = ApiKeyUsageFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  title: string;
  h: number;
};

/**
 * Line chart of total calls per day. Renders a skeleton until the audit metadata is loaded, then
 * delegates to the inner component.
 */
export function ApiKeyUsageCallsTimelineChart({
  provider,
  table,
  groupMembersTable,
  title,
  h = CHART_HEIGHT,
  ...filters
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <ApiKeyUsageCallsTimelineChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      title={title}
      h={h}
      {...filters}
    />
  );
}

function ApiKeyUsageCallsTimelineChartInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  title,
  h,
}: InnerProps) {
  const query = useMemo(
    () =>
      buildCallsByDayQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
      }),
    [provider, table, groupMembersTable, dateFilter, userId, groupId, tenantId],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);
  const { themeColor } = useMantineTheme().fn;

  const rawSeries = useMemo(
    () =>
      toCountBreakoutRawSeries(data, jsQuery, {
        display: "line",
        otherLabel: t`Other`,
        getColor: themeColor,
      }),
    [data, jsQuery, themeColor],
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
