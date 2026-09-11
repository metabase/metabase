import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton, useMantineTheme } from "metabase/ui";
import { BreakoutChartCard } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationStatsPage/BreakoutChartCard";
import { useAdhocBreakoutQuery } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { ApiKeyUsageFilters } from "metabase-enterprise/monitor/api-key-usage/query-utils";
import { buildCountBreakoutQuery } from "metabase-enterprise/monitor/api-key-usage/query-utils";
import { toCountBreakoutRawSeries } from "metabase-enterprise/monitor/api-key-usage/raw-series";
import type {
  CardMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import type { VisualizationDisplay } from "metabase-types/api";

const DEFAULT_CHART_HEIGHT = 350;
const DEFAULT_MAX_CATEGORIES = 8;

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type Props = DataSources &
  ApiKeyUsageFilters & {
    title: string;
    display: VisualizationDisplay;
    /** Column to break down call counts by (e.g. `client_display_name`, `route_template`). */
    breakoutColumn: string;
    maxCategories?: number;
    h?: number;
  };

type InnerProps = ApiKeyUsageFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  title: string;
  display: VisualizationDisplay;
  breakoutColumn: string;
  maxCategories: number;
  h: number;
};

/**
 * Single-breakout count chart (e.g. calls by client as a pie, calls by route as a row chart).
 * Renders a skeleton until the audit metadata is loaded, then delegates to the inner component.
 */
export function ApiKeyUsageBreakoutChart({
  provider,
  table,
  groupMembersTable,
  h = DEFAULT_CHART_HEIGHT,
  maxCategories = DEFAULT_MAX_CATEGORIES,
  ...rest
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <ApiKeyUsageBreakoutChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      maxCategories={maxCategories}
      {...rest}
    />
  );
}

/**
 * Loaded variant of {@link ApiKeyUsageBreakoutChart}: builds the breakout query, runs it, and
 * renders the result through the shared chart card. Split out so the query hooks only run once
 * metadata (provider/table) is available.
 */
function ApiKeyUsageBreakoutChartInner({
  provider,
  table,
  groupMembersTable,
  dateFilter,
  userId,
  groupId,
  tenantId,
  title,
  display,
  breakoutColumn,
  maxCategories,
  h,
}: InnerProps) {
  const query = useMemo<Query>(
    () =>
      buildCountBreakoutQuery({
        provider,
        table,
        groupMembersTable,
        dateFilter,
        userId,
        groupId,
        tenantId,
        breakoutColumn,
      }),
    [
      provider,
      table,
      groupMembersTable,
      dateFilter,
      userId,
      groupId,
      tenantId,
      breakoutColumn,
    ],
  );

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);
  const { themeColor } = useMantineTheme().fn;

  const rawSeries = useMemo(
    () =>
      toCountBreakoutRawSeries(data, jsQuery, {
        display,
        maxCategories,
        otherLabel: t`Other`,
        getColor: themeColor,
      }),
    [data, jsQuery, display, maxCategories, themeColor],
  );

  return (
    <BreakoutChartCard
      title={title}
      rawSeries={rawSeries}
      isFetching={isFetching}
      display={display}
      h={h}
      otherLabel={t`Other`}
    />
  );
}
