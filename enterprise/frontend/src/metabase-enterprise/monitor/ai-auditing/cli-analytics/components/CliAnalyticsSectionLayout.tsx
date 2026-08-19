import { type ReactNode, useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Outlet, useLocation } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Flex, Loader, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  VIEW_AGENT_API_CALLS,
  VIEW_GROUP_MEMBERS,
} from "metabase-enterprise/monitor/ai-auditing/cli-analytics/constants";
import { useCliHasData } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/hooks/useCliHasData";
import { cliUrlStateConfig } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/url-state";
import {
  ConversationFilters as CliCallsFilter,
  useFilterOptions,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";

import { CliAnalyticsEmptyState } from "./CliAnalyticsEmptyState";
import {
  CliAnalyticsContextProvider,
  type CliAnalyticsContextValue,
} from "./context";

type CliAnalyticsRouteContentProps = {
  context: CliAnalyticsContextValue;
  error: unknown;
  isInitialLoading: boolean;
  showEmpty: boolean;
};

function CliAnalyticsRouteContent({
  context,
  error,
  isInitialLoading,
  showEmpty,
}: CliAnalyticsRouteContentProps) {
  if (error != null) {
    return (
      <Flex mih="60vh" align="center" justify="center">
        <LoadingAndErrorWrapper loading={false} error={error} />
      </Flex>
    );
  }

  if (isInitialLoading) {
    return (
      <Flex mih="60vh" align="center" justify="center">
        <Loader size="lg" />
      </Flex>
    );
  }

  if (showEmpty) {
    return <CliAnalyticsEmptyState />;
  }

  return (
    <CliAnalyticsContextProvider value={context}>
      <Outlet />
    </CliAnalyticsContextProvider>
  );
}

export function CliAnalyticsSectionLayout(): ReactNode {
  const location = useLocation();
  const [
    { date, user, group, tenant, page, sort_column, sort_direction },
    { patchUrlState },
  ] = useUrlState(location, cliUrlStateConfig);

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
  const callsAudit = useAuditTable(VIEW_AGENT_API_CALLS);
  const groupMembersAudit = useAuditTable(VIEW_GROUP_MEMBERS);

  const dataSources = useMemo(
    () => ({
      provider: callsAudit.provider,
      table: callsAudit.table,
      groupMembersTable: groupMembersAudit.table,
    }),
    [callsAudit.provider, callsAudit.table, groupMembersAudit.table],
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
    useCliHasData({ ...dataSources, ...chartFilters });
  const { hasData: hasErrors } = useCliHasData({
    ...dataSources,
    ...chartFilters,
    errorsOnly: true,
  });
  const showEmpty = !isInitialLoading && !isRefetching && !hasData;

  const usagePath = Urls.monitorAiAuditingCliUsage();
  const callsPath = Urls.monitorAiAuditingCliCalls();
  const tabs: PillTab[] = [
    {
      label: t`Usage`,
      to: `${usagePath}${location.search}`,
      isSelected: (pathname) => pathname === usagePath,
    },
    {
      label: t`Calls`,
      to: `${callsPath}${location.search}`,
      isSelected: (pathname) => pathname === callsPath,
    },
  ];

  const isEventsRoute = location.pathname === callsPath;
  const outletContext = useMemo<CliAnalyticsContextValue>(
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

  const content = (
    <MonitorMain>
      <Stack gap="lg" {...(isEventsRoute ? { flex: 1, mih: 0 } : {})}>
        <MonitorHeaderTitle>{t`CLI analytics`}</MonitorHeaderTitle>

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
          <PillTabNavigation tabs={tabs} />

          <CliCallsFilter
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

          <CliAnalyticsRouteContent
            context={outletContext}
            error={error}
            isInitialLoading={isInitialLoading}
            showEmpty={showEmpty}
          />
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
