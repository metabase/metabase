import type { ReactNode } from "react";
import { useMemo } from "react";
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
  ConversationFilters as ApiKeyUsageFilterBar,
  useFilterOptions,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";
import {
  VIEW_API_KEY_USAGE,
  VIEW_GROUP_MEMBERS,
} from "metabase-enterprise/monitor/api-key-usage/constants";
import { useApiKeyUsageHasData } from "metabase-enterprise/monitor/api-key-usage/hooks/useApiKeyUsageHasData";
import { apiKeyUsageUrlStateConfig } from "metabase-enterprise/monitor/api-key-usage/url-state";

import { ApiKeyUsageEmptyState } from "./ApiKeyUsageEmptyState";
import {
  ApiKeyUsageContextProvider,
  type ApiKeyUsageContextValue,
} from "./context";

type RouteContentProps = {
  children: ReactNode;
  emptyState: ReactNode;
  error: unknown;
  isInitialLoading: boolean;
  showEmpty: boolean;
};

function RouteContent({
  children,
  emptyState,
  error,
  isInitialLoading,
  showEmpty,
}: RouteContentProps) {
  if (error !== undefined && error !== null) {
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

  return showEmpty ? emptyState : children;
}

export function ApiKeyUsageSectionLayout() {
  const location = useLocation();
  const [
    { date, user, group, tenant, page, sort_column, sort_direction },
    { patchUrlState },
  ] = useUrlState(location, apiKeyUsageUrlStateConfig);

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
  const usageAudit = useAuditTable(VIEW_API_KEY_USAGE);
  const groupMembersAudit = useAuditTable(VIEW_GROUP_MEMBERS);

  const dataSources = useMemo(
    () => ({
      provider: usageAudit.provider,
      table: usageAudit.table,
      groupMembersTable: groupMembersAudit.table,
    }),
    [usageAudit.provider, usageAudit.table, groupMembersAudit.table],
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
    useApiKeyUsageHasData({ ...dataSources, ...chartFilters });
  const showEmpty = !isInitialLoading && !isRefetching && !hasData;

  const usagePath = Urls.monitorApiKeyUsageOverview();
  const eventsPath = Urls.monitorApiKeyUsageEvents();
  const tabs: PillTab[] = [
    {
      label: t`Usage`,
      to: `${usagePath}${location.search}`,
      isSelected: (pathname) => pathname === usagePath,
    },
    {
      label: t`Events`,
      to: `${eventsPath}${location.search}`,
      isSelected: (pathname) => pathname === eventsPath,
    },
  ];

  const isTableRoute = location.pathname === eventsPath;
  const outletContext = useMemo<ApiKeyUsageContextValue>(
    () => ({
      dataSources,
      chartFilters,
      hasTenants,
      hasPii,
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
      hasPii,
      hasTenants,
      page,
      patchUrlState,
      sortingOptions,
    ],
  );

  const sectionContent = (
    <>
      <PillTabNavigation tabs={tabs} />
      <ApiKeyUsageFilterBar
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
      <RouteContent
        emptyState={<ApiKeyUsageEmptyState />}
        error={error}
        isInitialLoading={isInitialLoading}
        showEmpty={showEmpty}
      >
        <ApiKeyUsageContextProvider value={outletContext}>
          <Outlet />
        </ApiKeyUsageContextProvider>
      </RouteContent>
    </>
  );

  if (isTableRoute) {
    return (
      <Flex h="100%" wrap="nowrap">
        <MonitorMain>
          <Stack gap="xl" flex={1} mih={0}>
            <MonitorHeaderTitle>{t`API key usage`}</MonitorHeaderTitle>
            <Stack
              gap="lg"
              flex={1}
              mih={0}
              display="flex"
              style={{ flexDirection: "column" }}
            >
              {sectionContent}
            </Stack>
          </Stack>
        </MonitorMain>
      </Flex>
    );
  }

  return (
    <MonitorMain>
      <Stack gap="xl">
        <MonitorHeaderTitle>{t`API key usage`}</MonitorHeaderTitle>
        <Stack gap="lg">{sectionContent}</Stack>
      </Stack>
    </MonitorMain>
  );
}
