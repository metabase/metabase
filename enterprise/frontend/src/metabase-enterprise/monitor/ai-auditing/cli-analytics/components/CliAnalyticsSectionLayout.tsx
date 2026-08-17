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
  VIEW_AGENT_API_CALLS,
  VIEW_GROUP_MEMBERS,
} from "metabase-enterprise/monitor/ai-auditing/cli-analytics/constants";
import { useCliHasData } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/hooks/useCliHasData";
import type { CliEventSortColumn } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";
import { cliUrlStateConfig } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/url-state";
import {
  ConversationFilters as CliCallsFilter,
  useFilterOptions,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";
import type {
  CardMetadata,
  MetadataProvider,
  TableMetadata,
} from "metabase-lib";
import type { SortingOptions } from "metabase-types/api";

import { CliAnalyticsEmptyState } from "./CliAnalyticsEmptyState";

type CliDataSources = {
  provider: MetadataProvider | null;
  table: TableMetadata | CardMetadata | null;
  groupMembersTable: TableMetadata | CardMetadata | null;
};

type CliChartFilters = {
  dateFilter: ReturnType<typeof useFilterOptions>["dateFilter"];
  userId: number | undefined;
  groupId: number | undefined;
  tenantId: number | undefined;
};

export type CliAnalyticsContextValue = {
  dataSources: CliDataSources;
  chartFilters: CliChartFilters;
  hasTenants: boolean;
  hasPii: boolean;
  hasErrors: boolean;
  page: number;
  total: number;
  onPageChange: (page: number, options?: PatchUrlStateOptions) => void;
  sortingOptions: SortingOptions<CliEventSortColumn>;
  onSortingOptionsChange: (
    sortingOptions: SortingOptions<CliEventSortColumn>,
  ) => void;
};

const CliAnalyticsContext = createContext<CliAnalyticsContextValue | null>(
  null,
);

export function useCliAnalyticsContext(): CliAnalyticsContextValue {
  const context = useContext(CliAnalyticsContext);
  if (context == null) {
    throw new Error(
      "useCliAnalyticsContext must be used within CliAnalyticsSectionLayout",
    );
  }
  return context;
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

  const dataSources = {
    provider: callsAudit.provider,
    table: callsAudit.table,
    groupMembersTable: groupMembersAudit.table,
  };
  const chartFilters = { dateFilter, userId, groupId, tenantId };

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

  // Tab links carry the current query string so the filters survive a tab switch.
  const tabs: MonitorHeaderTab[] = [
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

  const outletContext: CliAnalyticsContextValue = {
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
          <MonitorHeaderTabs tabs={tabs} />

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

          {error != null ? (
            <Flex mih="60vh" align="center" justify="center">
              <LoadingAndErrorWrapper loading={false} error={error} />
            </Flex>
          ) : isInitialLoading ? (
            <Flex mih="60vh" align="center" justify="center">
              <Loader size="lg" />
            </Flex>
          ) : showEmpty ? (
            <CliAnalyticsEmptyState />
          ) : (
            <CliAnalyticsContext.Provider value={outletContext}>
              <Outlet />
            </CliAnalyticsContext.Provider>
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
