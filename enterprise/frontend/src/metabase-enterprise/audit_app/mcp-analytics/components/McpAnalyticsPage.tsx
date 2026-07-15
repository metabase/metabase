import { useEffect } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { MetabotAdminLayout } from "metabase/admin/ai/MetabotAdminLayout";
import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useSetting } from "metabase/common/hooks";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import type { WithRouterProps } from "metabase/router";
import { Flex, Loader, SimpleGrid, Stack, Tabs, Title } from "metabase/ui";

import {
  // The shared audit filter bar; aliased since it has nothing to do with MCP "conversations".
  ConversationFilters as McpToolCallsFilter,
  useFilterOptions,
} from "../../metabot-analytics/components/ConversationFilters";
import { useAuditTable } from "../../metabot-analytics/hooks/useAuditTable";
import { VIEW_GROUP_MEMBERS, VIEW_MCP_TOOL_CALLS } from "../constants";
import { useMcpHasData } from "../hooks/useMcpHasData";
import { buildCallsByDayByStatusQuery } from "../query-utils";
import type { McpTab } from "../url-state";
import { mcpUrlStateConfig } from "../url-state";

import { McpAnalyticsEmptyState } from "./McpAnalyticsEmptyState";
import { McpBreakoutChart } from "./McpBreakoutChart";
import { McpCallsTimelineChart } from "./McpCallsTimelineChart";
import { McpEventsTable } from "./McpEventsTable";

/**
 * Admin MCP analytics page. Renders live ad-hoc queries over the `v_mcp_tool_calls` audit view
 * across two tabs (Charts and a row-level Events table), sharing URL-state date/user/group
 * filters. Shows a single empty state (no tabs) when the filtered view has no activity.
 */
export function McpAnalyticsPage({ location, router }: WithRouterProps) {
  const [{ date, user, group, tenant, tab }, { patchUrlState }] = useUrlState(
    location,
    mcpUrlStateConfig,
  );

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
  // The MCP server can be turned off while its historical analytics still exist; when it's off the
  // page is inaccessible (the nav item greys out — this also blocks direct URL access).
  const mcpEnabled = useSetting("mcp-enabled?");

  const toolCallsAudit = useAuditTable(VIEW_MCP_TOOL_CALLS);
  const groupMembersAudit = useAuditTable(VIEW_GROUP_MEMBERS);

  const dataSources = {
    provider: toolCallsAudit.provider,
    table: toolCallsAudit.table,
    groupMembersTable: groupMembersAudit.table,
  };

  const chartFilters = { dateFilter, userId, groupId, tenantId };

  const { isInitialLoading, isRefetching, hasData } = useMcpHasData({
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

  // The MCP server can be off while its historical analytics still exist; when it's off the page
  // is inaccessible — redirect away so it can't be reached by URL (the nav item also greys out).
  useEffect(() => {
    if (!mcpEnabled) {
      router.replace("/admin/metabot/usage-auditing");
    }
  }, [mcpEnabled, router]);

  if (!mcpEnabled) {
    return null;
  }

  return (
    <MetabotAdminLayout fullWidth>
      <SettingsPageWrapper mt="sm">
        <Flex align="center" justify="space-between">
          <Title order={2}>{t`MCP analytics`}</Title>

          <McpToolCallsFilter
            date={date}
            onDateChange={(val) => patchUrlState({ date: val })}
            user={user}
            onUserChange={(val) => patchUrlState({ user: val })}
            userOptions={userOptions}
            group={group}
            onGroupChange={(val) => patchUrlState({ group: val })}
            groupOptions={groupOptions}
            groupNoFilterValue={groupNoFilterValue}
            tenant={tenant}
            onTenantChange={(val) => patchUrlState({ tenant: val })}
            tenantOptions={tenantOptions}
            hasTenants={hasTenants}
          />
        </Flex>

        {match({ isInitialLoading, showEmpty })
          .with({ isInitialLoading: true }, () => (
            <Flex mih="60vh" align="center" justify="center">
              <Loader size="lg" />
            </Flex>
          ))
          .with({ showEmpty: true }, () => <McpAnalyticsEmptyState />)
          .otherwise(() => (
            <Tabs
              value={tab}
              // Unjustified type cast. FIXME
              onChange={(val) => patchUrlState({ tab: val as McpTab })}
              keepMounted={false}
            >
              <Tabs.List mb="lg">
                <Tabs.Tab value="charts">{t`Usage`}</Tabs.Tab>
                <Tabs.Tab value="events">{t`Tool calls`}</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="charts">
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

              <Tabs.Panel value="events">
                <McpEventsTable
                  {...dataSources}
                  {...chartFilters}
                  hasTenants={hasTenants}
                  hasPii={hasPii}
                />
              </Tabs.Panel>
            </Tabs>
          ))}
      </SettingsPageWrapper>
    </MetabotAdminLayout>
  );
}
