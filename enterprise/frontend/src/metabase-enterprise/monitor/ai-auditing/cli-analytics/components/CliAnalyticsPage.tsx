import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { useRouter } from "metabase/router";
import { Flex, Loader, SimpleGrid, Stack, Tabs, Title } from "metabase/ui";
import {
  VIEW_AGENT_API_CALLS,
  VIEW_GROUP_MEMBERS,
} from "metabase-enterprise/monitor/ai-auditing/cli-analytics/constants";
import { useCliHasData } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/hooks/useCliHasData";
import { buildCallsByDayByStatusQuery } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";
import type { CliTab } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/url-state";
import { cliUrlStateConfig } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/url-state";
import {
  // The shared audit filter bar; aliased since it has nothing to do with Metabot "conversations".
  ConversationFilters as CliCallsFilter,
  useFilterOptions,
} from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "metabase-enterprise/monitor/ai-auditing/metabot-analytics/hooks/useAuditTable";

import { CliAnalyticsEmptyState } from "./CliAnalyticsEmptyState";
import { CliBreakoutChart } from "./CliBreakoutChart";
import { CliCallerLivenessTable } from "./CliCallerLivenessTable";
import { CliCallsTimelineChart } from "./CliCallsTimelineChart";
import { CliEventsTable } from "./CliEventsTable";

/**
 * AI Auditing CLI analytics page. Renders live ad-hoc queries over the `v_agent_api_calls` audit view
 * across two tabs (Charts and a row-level Calls table), sharing URL-state date/user/group
 * filters. Shows a single empty state (no tabs) when the filtered view has no activity.
 */
export function CliAnalyticsPage() {
  const { location } = useRouter();
  const [
    { date, user, group, tenant, tab, page, sort_column, sort_direction },
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

  // IP address and error message are PII (null unless retention is on), so only surface those
  // columns when they're collected.
  const hasPii = useSetting("analytics-pii-retention-enabled") === true;

  const callsAudit = useAuditTable(VIEW_AGENT_API_CALLS);
  const groupMembersAudit = useAuditTable(VIEW_GROUP_MEMBERS);

  const dataSources = {
    provider: callsAudit.provider,
    table: callsAudit.table,
    groupMembersTable: groupMembersAudit.table,
  };

  const chartFilters = { dateFilter, userId, groupId, tenantId };

  // Keep this referentially stable: it feeds the events query's `useMemo`, and each rebuild mints
  // fresh metabase-lib UUIDs, which change the query's serialized RTK cache key and trigger a
  // redundant refetch (and loader flash) on every incidental re-render.
  const sortingOptions = useMemo(
    () => ({ sort_column, sort_direction }),
    [sort_column, sort_direction],
  );

  const { isInitialLoading, isRefetching, hasData, count } = useCliHasData({
    ...dataSources,
    ...chartFilters,
  });
  // Initial load shows a loader (never the empty state). After the first result, a filter
  // change keeps the charts mounted so they show their own skeletons while refetching; the
  // empty state only appears once a load has resolved to zero rows.
  const showEmpty = !isInitialLoading && !isRefetching && !hasData;

  // Only surface the errors section when the current filters actually match failed calls, so a
  // healthy instance doesn't show a row of empty error charts.
  const { hasData: hasErrors } = useCliHasData({
    ...dataSources,
    ...chartFilters,
    errorsOnly: true,
  });

  // The Calls tab is a data grid that should scroll internally.
  const isEventsTab = tab === "events";

  const content = (
    <MonitorMain>
      <Stack gap="lg" {...(isEventsTab ? { flex: 1, mih: 0 } : {})}>
        <MonitorHeaderTitle>{t`CLI analytics`}</MonitorHeaderTitle>

        <Tabs
          variant="pills"
          value={tab}
          // tab/val _is_ a CliTab, but Mantine's Tab only deals with strings ¯\_(ツ)_/¯
          onChange={(val) => patchUrlState({ tab: val as CliTab })}
          keepMounted={false}
          {...(isEventsTab
            ? {
                flex: 1,
                mih: 0,
                display: "flex",
                style: { flexDirection: "column" as const },
              }
            : {})}
        >
          <Tabs.List mb="md">
            <Tabs.Tab value="charts">{t`Usage`}</Tabs.Tab>
            <Tabs.Tab value="events">{t`Calls`}</Tabs.Tab>
          </Tabs.List>

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

          {match({ isInitialLoading, showEmpty })
            .with({ isInitialLoading: true }, () => (
              // Keeps the active tab's panel/tabpanel relationship intact (aria-controls on the
              // selected tab must point at a rendered element) while the initial load is pending.
              <Tabs.Panel value={tab} mt="md">
                <Flex mih="60vh" align="center" justify="center">
                  <Loader size="lg" />
                </Flex>
              </Tabs.Panel>
            ))
            .with({ showEmpty: true }, () => (
              <Tabs.Panel value={tab} mt="md">
                <CliAnalyticsEmptyState />
              </Tabs.Panel>
            ))
            .otherwise(() => (
              <>
                <Tabs.Panel value="charts" mt="md">
                  <Stack gap="lg">
                    <CliCallsTimelineChart
                      {...dataSources}
                      {...chartFilters}
                      title={t`Calls by client over time`}
                    />
                    <SimpleGrid cols={2} spacing="lg">
                      <CliBreakoutChart
                        {...dataSources}
                        {...chartFilters}
                        title={t`Calls by client`}
                        display="pie"
                        breakoutColumn="client_display_name"
                        h={500}
                      />
                      <CliBreakoutChart
                        {...dataSources}
                        {...chartFilters}
                        title={t`Calls by operation`}
                        display="row"
                        breakoutColumn="operation"
                        h={500}
                      />
                    </SimpleGrid>
                    <SimpleGrid cols={2} spacing="lg">
                      <CliBreakoutChart
                        {...dataSources}
                        {...chartFilters}
                        title={t`Calls by user`}
                        display="row"
                        breakoutColumn="user_display_name"
                        h={500}
                      />
                      <CliCallerLivenessTable
                        {...dataSources}
                        {...chartFilters}
                        title={t`User activity`}
                        h={500}
                      />
                    </SimpleGrid>

                    {hasErrors && (
                      <>
                        <Title order={3} mt="md">{t`Errors`}</Title>
                        <CliCallsTimelineChart
                          {...dataSources}
                          {...chartFilters}
                          title={t`Calls by status over time`}
                          buildQuery={buildCallsByDayByStatusQuery}
                        />
                        <CliBreakoutChart
                          {...dataSources}
                          {...chartFilters}
                          title={t`Errors by operation`}
                          display="row"
                          breakoutColumn="operation"
                          errorsOnly
                          h={500}
                        />
                      </>
                    )}
                  </Stack>
                </Tabs.Panel>

                <Tabs.Panel
                  value="events"
                  mt="md"
                  flex={1}
                  mih={0}
                  display="flex"
                  style={{ flexDirection: "column" }}
                >
                  <CliEventsTable
                    {...dataSources}
                    {...chartFilters}
                    hasTenants={hasTenants}
                    hasPii={hasPii}
                    page={page}
                    total={count}
                    onPageChange={(newPage) => patchUrlState({ page: newPage })}
                    sortingOptions={sortingOptions}
                    onSortingOptionsChange={(newSorting) =>
                      patchUrlState({
                        sort_column: newSorting.sort_column,
                        sort_direction: newSorting.sort_direction,
                        page: 0,
                      })
                    }
                  />
                </Tabs.Panel>
              </>
            ))}
        </Tabs>
      </Stack>
    </MonitorMain>
  );

  return isEventsTab ? (
    <Flex h="100%" wrap="nowrap">
      {content}
    </Flex>
  ) : (
    content
  );
}
