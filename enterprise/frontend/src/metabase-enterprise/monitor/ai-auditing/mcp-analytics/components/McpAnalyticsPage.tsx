import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import type { WithRouterProps } from "metabase/router";
import { Box, Flex, Loader, SimpleGrid, Stack, Tabs, Title } from "metabase/ui";

import {
  // The shared audit filter bar; aliased since it has nothing to do with MCP "conversations".
  ConversationFilters as McpToolCallsFilter,
  useFilterOptions,
} from "../../metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "../../metabot-analytics/hooks/useAuditTable";
import { VIEW_GROUP_MEMBERS, VIEW_MCP_TOOL_CALLS } from "../constants";
import { useMcpHasData } from "../hooks/useMcpHasData";
import { buildCallsByDayByStatusQuery } from "../query-utils";
import { mcpUrlStateConfig } from "../url-state";

import { McpAnalyticsEmptyState } from "./McpAnalyticsEmptyState";
import { McpBreakoutChart } from "./McpBreakoutChart";
import { McpCallsTimelineChart } from "./McpCallsTimelineChart";
import { McpEventsTable } from "./McpEventsTable";

/**
 * AI Auditing MCP analytics page. Renders live ad-hoc queries over the `v_mcp_tool_calls` audit view
 * across two tabs (Charts and a row-level Events table), sharing URL-state date/user/group
 * filters. Shows a single empty state (no tabs) when the filtered view has no activity.
 */
export function McpAnalyticsPage({ location }: WithRouterProps) {
  const [
    { date, user, group, tenant, tab, page, sortColumn, sortDirection },
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
    () => ({ sort_column: sortColumn, sort_direction: sortDirection }),
    [sortColumn, sortDirection],
  );

  const { isInitialLoading, isRefetching, hasData, count } = useMcpHasData({
    ...dataSources,
    ...chartFilters,
  });
  // Initial load shows a loader (never the empty state). After the first result, a filter
  // change keeps the charts mounted so they show their own skeletons while refetching; the
  // empty state only appears once a load has resolved to zero rows.
  const showEmpty = !isInitialLoading && !isRefetching && !hasData;

  // Only surface the errors section when the current filters actually match failed calls, so a
  // healthy instance doesn't show a row of empty error charts.
  const { hasData: hasErrors } = useMcpHasData({
    ...dataSources,
    ...chartFilters,
    errorsOnly: true,
  });

  // The events (Tool calls) tab is a data grid that should scroll internally, like other
  // Monitor grid views; the charts tab is dashboard-like content that scrolls with the page.
  // MonitorMain only fills/clips the viewport when its own parent is a flex container, so that
  // constraint is applied conditionally, matching whichever tab is active.
  const isEventsTab = tab === "events";

  const content = (
    <MonitorMain>
      <Stack
        gap="lg"
        flex={isEventsTab ? 1 : undefined}
        mih={isEventsTab ? 0 : undefined}
      >
        <MonitorHeaderTitle>{t`MCP analytics`}</MonitorHeaderTitle>

        <Tabs
          variant="pills"
          value={tab}
          onChange={(val) =>
            patchUrlState({ tab: val === "events" ? "events" : "charts" })
          }
          keepMounted={false}
          flex={isEventsTab ? 1 : undefined}
          mih={isEventsTab ? 0 : undefined}
          display={isEventsTab ? "flex" : undefined}
          style={isEventsTab ? { flexDirection: "column" } : undefined}
        >
          <Tabs.List mb="md">
            <Tabs.Tab value="charts">{t`Usage`}</Tabs.Tab>
            <Tabs.Tab value="events">{t`Tool calls`}</Tabs.Tab>
          </Tabs.List>

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

          {match({ isInitialLoading, showEmpty })
            .with({ isInitialLoading: true }, () => (
              <Flex mih="60vh" align="center" justify="center" mt="md">
                <Loader size="lg" />
              </Flex>
            ))
            .with({ showEmpty: true }, () => (
              <Box mt="md">
                <McpAnalyticsEmptyState />
              </Box>
            ))
            .otherwise(() => (
              <>
                <Tabs.Panel value="charts" mt="md">
                  <Stack gap="lg">
                    <McpCallsTimelineChart
                      {...dataSources}
                      {...chartFilters}
                      title={t`Calls by client over time`}
                    />
                    <SimpleGrid cols={2} spacing="lg">
                      <McpBreakoutChart
                        {...dataSources}
                        {...chartFilters}
                        title={t`Calls by tool`}
                        display="pie"
                        breakoutColumn="tool_name"
                        h={500}
                      />
                      <McpBreakoutChart
                        {...dataSources}
                        {...chartFilters}
                        title={t`Calls by user`}
                        display="row"
                        breakoutColumn="user_display_name"
                        h={500}
                      />
                    </SimpleGrid>

                    {hasErrors && (
                      <>
                        <Title order={3} mt="md">{t`Errors`}</Title>
                        <McpCallsTimelineChart
                          {...dataSources}
                          {...chartFilters}
                          title={t`Calls by status over time`}
                          buildQuery={buildCallsByDayByStatusQuery}
                        />
                        <SimpleGrid cols={2} spacing="lg">
                          <McpBreakoutChart
                            {...dataSources}
                            {...chartFilters}
                            title={t`Errors by type`}
                            display="pie"
                            breakoutColumn="error_type"
                            errorsOnly
                            h={500}
                          />
                          <McpBreakoutChart
                            {...dataSources}
                            {...chartFilters}
                            title={t`Errors by tool`}
                            display="row"
                            breakoutColumn="tool_name"
                            errorsOnly
                            h={500}
                          />
                        </SimpleGrid>
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
                  <McpEventsTable
                    {...dataSources}
                    {...chartFilters}
                    hasTenants={hasTenants}
                    hasPii={hasPii}
                    page={page}
                    total={count}
                    onPageChange={(newPage) =>
                      patchUrlState({ page: newPage }, { immediate: true })
                    }
                    sortingOptions={sortingOptions}
                    onSortingOptionsChange={(newSorting) =>
                      patchUrlState({
                        sortColumn: newSorting.sort_column,
                        sortDirection: newSorting.sort_direction,
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
