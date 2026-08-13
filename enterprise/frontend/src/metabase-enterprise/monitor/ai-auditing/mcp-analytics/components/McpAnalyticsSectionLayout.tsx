import { type ReactNode, createContext, useContext, useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { PatchUrlStateOptions } from "metabase/common/hooks/use-url-state";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import {
  type MonitorHeaderTab,
  MonitorHeaderTabs,
} from "metabase/monitor/components/MonitorHeaderTabs";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Outlet, useLocation } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Flex, Loader, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  VIEW_GROUP_MEMBERS,
  VIEW_MCP_TOOL_CALLS,
} from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/constants";
import { useMcpHasData } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/hooks/useMcpHasData";
import type { McpEventSortColumn } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/query-utils";
import { mcpUrlStateConfig } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/url-state";
import {
  // The shared audit filter bar; aliased since it has nothing to do with MCP "conversations".
  ConversationFilters as McpToolCallsFilter,
  useFilterOptions,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { SortingOptions } from "metabase-types/api";

import { McpAnalyticsEmptyState } from "./McpAnalyticsEmptyState";

type McpDataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type McpChartFilters = {
  dateFilter: ReturnType<typeof useFilterOptions>["dateFilter"];
  userId: number | undefined;
  groupId: number | undefined;
  tenantId: number | undefined;
};

export type McpAnalyticsContextValue = {
  dataSources: McpDataSources;
  chartFilters: McpChartFilters;
  hasTenants: boolean;
  hasPii: boolean;
  hasErrors: boolean;
  page: number;
  total: number;
  onPageChange: (page: number, options?: PatchUrlStateOptions) => void;
  sortingOptions: SortingOptions<McpEventSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<McpEventSortColumn>,
  ) => void;
};

const McpAnalyticsContext = createContext<McpAnalyticsContextValue | null>(
  null,
);

/** Shared filters, data sources, and events pagination/sorting, provided by {@link McpAnalyticsSectionLayout}. */
export function useMcpAnalyticsContext(): McpAnalyticsContextValue {
  const context = useContext(McpAnalyticsContext);
  if (context == null) {
    throw new Error(
      "useMcpAnalyticsContext must be used within McpAnalyticsSectionLayout",
    );
  }
  return context;
}

/**
 * Shared layout for the MCP analytics section: header, tab navigation, and the audit filter bar,
 * with `/usage` (charts) and `/events` (row-level table) rendered through `<Outlet />`. Owns the
 * URL-state filters and events pagination/sorting so both sub-routes stay in sync, and gates the
 * outlet on a single shared "has any data" query so switching tabs never re-fetches the count.
 */
export function McpAnalyticsSectionLayout(): ReactNode {
  const location = useLocation();
  const [
    { date, user, group, tenant, page, sort_column, sort_direction },
    { patchUrlState },
  ] = useUrlState(location, mcpUrlStateConfig);

  const {
    dateFilter,
    userId,
    groupId,
    tenantId,
    groupNoFilterValue,
    userOptions,
    groupOptions,
    tenantOptions,
    hasTenants,
  } = useFilterOptions({ date, user, group, tenant });

  // IP address and error message are PII (null unless retention is on), so only surface those
  // columns when they're collected.
  const hasPii = useSetting("analytics-pii-retention-enabled") === true;
  const toolCallsAudit = useAuditTable(VIEW_MCP_TOOL_CALLS);
  const groupMembersAudit = useAuditTable(VIEW_GROUP_MEMBERS);

  const dataSources = {
    provider: toolCallsAudit.provider,
    table: toolCallsAudit.table,
    groupMembersTable: groupMembersAudit.table,
  };
  const chartFilters = { dateFilter, userId, groupId, tenantId };

  const sortingOptions = useMemo(
    () => ({ sort_column, sort_direction }),
    [sort_column, sort_direction],
  );

  const { isInitialLoading, isRefetching, hasData, count, error } =
    useMcpHasData({ ...dataSources, ...chartFilters });
  const { hasData: hasErrors } = useMcpHasData({
    ...dataSources,
    ...chartFilters,
    errorsOnly: true,
  });
  const showEmpty = !isInitialLoading && !isRefetching && !hasData;

  const usagePath = Urls.monitorAiAuditingMcpUsage();
  const eventsPath = Urls.monitorAiAuditingMcpEvents();

  // Tab links carry the current query string so the filters (and the table's page/sort) survive a
  // tab switch in the URL itself, keeping it shareable — the old query-param tabs patched the URL,
  // which preserved them implicitly. Selection still matches on the pathname alone.
  const tabs: MonitorHeaderTab[] = [
    {
      label: t`Usage`,
      to: `${usagePath}${location.search}`,
      isSelected: (pathname) => pathname === usagePath,
    },
    {
      label: t`Tool calls`,
      to: `${eventsPath}${location.search}`,
      isSelected: (pathname) => pathname === eventsPath,
    },
  ];

  // The Tool calls route is a data grid that should scroll internally.
  const isEventsRoute = location.pathname === eventsPath;

  const outletContext: McpAnalyticsContextValue = {
    dataSources,
    chartFilters,
    hasTenants,
    hasPii,
    hasErrors,
    page,
    total: count,
    onPageChange: (newPage, options) =>
      patchUrlState({ page: newPage }, options),
    sortingOptions,
    onSortingOptionsChange: (newSorting) =>
      patchUrlState({
        sort_column: newSorting.sort_column,
        sort_direction: newSorting.sort_direction,
        page: 0,
      }),
  };

  const content = (
    <MonitorMain>
      <Stack gap="lg" {...(isEventsRoute ? { flex: 1, mih: 0 } : {})}>
        <MonitorHeaderTitle>{t`MCP analytics`}</MonitorHeaderTitle>

        <Stack
          gap="md"
          {...(isEventsRoute
            ? {
                flex: 1,
                mih: 0,
                display: "flex",
                style: { flexDirection: "column" as const },
              }
            : {})}
        >
          <MonitorHeaderTabs tabs={tabs} />

          <McpToolCallsFilter
            date={date}
            onDateChange={(val) => patchUrlState({ date: val, page: 0 })}
            user={user}
            onUserChange={(val) => patchUrlState({ user: val, page: 0 })}
            userOptions={userOptions}
            group={group}
            onGroupChange={(val) => patchUrlState({ group: val, page: 0 })}
            groupOptions={groupOptions}
            groupNoFilterValue={groupNoFilterValue}
            tenant={tenant}
            onTenantChange={(val) => patchUrlState({ tenant: val, page: 0 })}
            tenantOptions={tenantOptions}
            hasTenants={hasTenants}
          />

          {error != null ? (
            <Flex mih="60vh" align="center" justify="center">
              <LoadingAndErrorWrapper loading={false} error={error} />
            </Flex>
          ) : isInitialLoading ? (
            <Flex mih="60vh" align="center" justify="center">
              <Loader size="lg" />
            </Flex>
          ) : showEmpty ? (
            <McpAnalyticsEmptyState />
          ) : (
            <McpAnalyticsContext.Provider value={outletContext}>
              <Outlet />
            </McpAnalyticsContext.Provider>
          )}
        </Stack>
      </Stack>
    </MonitorMain>
  );

  return isEventsRoute ? (
    <Flex h="100%" wrap="nowrap">
      {content}
    </Flex>
  ) : (
    content
  );
}
