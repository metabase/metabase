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
  // The shared audit filter bar; aliased since it has nothing to do with Metabot "conversations".
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

/** Shared filters, data sources, and calls pagination/sorting, provided by {@link CliAnalyticsSectionLayout}. */
export function useCliAnalyticsContext(): CliAnalyticsContextValue {
  const context = useContext(CliAnalyticsContext);
  if (context == null) {
    throw new Error(
      "useCliAnalyticsContext must be used within CliAnalyticsSectionLayout",
    );
  }
  return context;
}

/**
 * Shared layout for the CLI analytics section: header, tab navigation, and the audit filter bar,
 * with `/usage` (charts) and `/calls` (row-level table) rendered through `<Outlet />`. Owns the
 * URL-state filters and calls pagination/sorting so both sub-routes stay in sync, and gates the
 * outlet on a single shared "has any data" query so switching tabs never re-fetches the count.
 */
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
      label: t`Calls`,
      to: `${callsPath}${location.search}`,
      isSelected: (pathname) => pathname === callsPath,
    },
  ];

  // The Calls route is a data grid that should scroll internally.
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
