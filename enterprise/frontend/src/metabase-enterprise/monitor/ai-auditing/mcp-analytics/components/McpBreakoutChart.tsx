import { useMemo } from "react";
import { t } from "ttag";

import { Skeleton, useMantineTheme } from "metabase/ui";
import type {
  CardMetadata,
  MetadataProvider,
  Query,
  TableMetadata,
} from "metabase-lib";
import type { VisualizationDisplay } from "metabase-types/api";

import { BreakoutChartCard } from "../../metabot-analytics/components/ConversationStatsPage/BreakoutChartCard";
import { mapBreakoutDimension } from "../../metabot-analytics/components/ConversationStatsPage/breakout-raw-series";
import { useAdhocBreakoutQuery } from "../../metabot-analytics/hooks/useAdhocBreakoutQuery";
import type { McpFilters } from "../query-utils";
import {
  buildCountBreakoutQuery,
  buildErrorBreakoutQuery,
} from "../query-utils";
import { toCountBreakoutRawSeries } from "../raw-series";

const DEFAULT_CHART_HEIGHT = 350;
const DEFAULT_MAX_CATEGORIES = 8;

type DataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type Props = DataSources &
  McpFilters & {
    title: string;
    display: VisualizationDisplay;
    /** Column to break down call counts by (e.g. `tool_name`, `user_display_name`). */
    breakoutColumn: string;
    /** When set, count only failed calls (`status = error`) — for the error breakdown charts. */
    errorsOnly?: boolean;
    labelMapper?: (value: unknown) => unknown;
    maxCategories?: number;
    h?: number;
  };

type InnerProps = McpFilters & {
  provider: MetadataProvider;
  table: TableMetadata | CardMetadata;
  groupMembersTable: TableMetadata | CardMetadata;
  title: string;
  display: VisualizationDisplay;
  breakoutColumn: string;
  errorsOnly: boolean;
  labelMapper?: (value: unknown) => unknown;
  maxCategories: number;
  h: number;
};

/**
 * Single-breakout count chart (e.g. calls by tool as a pie, calls by user as a row chart).
 * Renders a skeleton until the audit metadata is loaded, then delegates to the inner component.
 */
export function McpBreakoutChart({
  provider,
  table,
  groupMembersTable,
  h = DEFAULT_CHART_HEIGHT,
  maxCategories = DEFAULT_MAX_CATEGORIES,
  errorsOnly = false,
  ...rest
}: Props) {
  if (!provider || !table || !groupMembersTable) {
    return <Skeleton h={h} />;
  }
  return (
    <McpBreakoutChartInner
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      h={h}
      maxCategories={maxCategories}
      errorsOnly={errorsOnly}
      {...rest}
    />
  );
}

/**
 * Loaded variant of {@link McpBreakoutChart}: builds the breakout query, runs it, and renders
 * the result through the shared chart card. Split out so the query hooks only run once metadata
 * (provider/table) is available.
 */
function McpBreakoutChartInner({
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
  errorsOnly,
  labelMapper,
  maxCategories,
  h,
}: InnerProps) {
  const query = useMemo<Query>(() => {
    const opts = {
      provider,
      table,
      groupMembersTable,
      dateFilter,
      userId,
      groupId,
      tenantId,
      breakoutColumn,
    };
    return errorsOnly
      ? buildErrorBreakoutQuery(opts)
      : buildCountBreakoutQuery(opts);
  }, [
    provider,
    table,
    groupMembersTable,
    dateFilter,
    userId,
    groupId,
    tenantId,
    breakoutColumn,
    errorsOnly,
  ]);

  const { data, jsQuery, isFetching } = useAdhocBreakoutQuery(query);
  const { themeColor } = useMantineTheme().fn;

  const rawSeries = useMemo(() => {
    const labeled = labelMapper
      ? mapBreakoutDimension(data, labelMapper)
      : data;
    return toCountBreakoutRawSeries(labeled, jsQuery, {
      display,
      maxCategories,
      otherLabel: t`Other`,
      getColor: themeColor,
    });
  }, [data, jsQuery, labelMapper, display, maxCategories, themeColor]);

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
