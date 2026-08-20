import { useMemo } from "react";
import { t } from "ttag";

import type { PillTab } from "metabase/common/components/PillTabNavigation";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { Outlet, useLocation } from "metabase/router";
import { useSetting } from "metabase/settings";
import * as Urls from "metabase/urls";
import { AiAnalyticsSectionLayout } from "metabase-enterprise/monitor/ai-auditing/components/AiAnalyticsSectionLayout";
import {
  VIEW_GROUP_MEMBERS,
  VIEW_MCP_TOOL_CALLS,
} from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/constants";
import { useMcpHasData } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/hooks/useMcpHasData";
import { mcpUrlStateConfig } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/url-state";
import {
  ConversationFilters as McpToolCallsFilter,
  useFilterOptions,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";

import { McpAnalyticsEmptyState } from "./McpAnalyticsEmptyState";
import {
  McpAnalyticsContextProvider,
  type McpAnalyticsContextValue,
} from "./context";

export function McpAnalyticsSectionLayout() {
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

  const hasPii = useSetting("analytics-pii-retention-enabled") === true;
  const toolCallsAudit = useAuditTable(VIEW_MCP_TOOL_CALLS);
  const groupMembersAudit = useAuditTable(VIEW_GROUP_MEMBERS);

  const dataSources = useMemo(
    () => ({
      provider: toolCallsAudit.provider,
      table: toolCallsAudit.table,
      groupMembersTable: groupMembersAudit.table,
    }),
    [groupMembersAudit.table, toolCallsAudit.provider, toolCallsAudit.table],
  );
  const chartFilters = useMemo(
    () => ({ dateFilter, userId, groupId, tenantId }),
    [dateFilter, groupId, tenantId, userId],
  );
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
  const tabs: PillTab[] = [
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

  const isEventsRoute = location.pathname === eventsPath;
  const outletContext = useMemo<McpAnalyticsContextValue>(
    () => ({
      dataSources,
      chartFilters,
      hasTenants,
      hasPii,
      hasErrors,
      page,
      total: count,
      onPageChange: (newPage) =>
        patchUrlState({ page: newPage }, { immediate: true }),
      sortingOptions,
      onSortingOptionsChange: (newSorting) =>
        patchUrlState({
          sort_column: newSorting.sort_column,
          sort_direction: newSorting.sort_direction,
          page: 0,
        }),
    }),
    [
      chartFilters,
      count,
      dataSources,
      hasErrors,
      hasPii,
      hasTenants,
      page,
      patchUrlState,
      sortingOptions,
    ],
  );

  return (
    <AiAnalyticsSectionLayout
      title={t`MCP analytics`}
      tabs={tabs}
      filters={
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
      }
      emptyState={<McpAnalyticsEmptyState />}
      error={error}
      isInitialLoading={isInitialLoading}
      isTableRoute={isEventsRoute}
      showEmpty={showEmpty}
    >
      <McpAnalyticsContextProvider value={outletContext}>
        <Outlet />
      </McpAnalyticsContextProvider>
    </AiAnalyticsSectionLayout>
  );
}
