import { t } from "ttag";

import { SimpleGrid, Stack, Title } from "metabase/ui";
import { buildCallsByDayByStatusQuery } from "metabase-enterprise/monitor/ai-auditing/mcp-analytics/query-utils";

import { McpBreakoutChart } from "./McpBreakoutChart";
import { McpCallsTimelineChart } from "./McpCallsTimelineChart";
import { useMcpAnalyticsContext } from "./context";

export function McpUsagePage() {
  const {
    dataSources: { provider, table, groupMembersTable },
    chartFilters: { dateFilter, userId, groupId, tenantId },
    hasErrors,
  } = useMcpAnalyticsContext();

  return (
    <Stack gap="xl">
      <McpCallsTimelineChart
        provider={provider}
        table={table}
        groupMembersTable={groupMembersTable}
        dateFilter={dateFilter}
        userId={userId}
        groupId={groupId}
        tenantId={tenantId}
        title={t`Calls by client over time`}
      />
      <SimpleGrid cols={2} spacing="xl">
        <McpBreakoutChart
          provider={provider}
          table={table}
          groupMembersTable={groupMembersTable}
          dateFilter={dateFilter}
          userId={userId}
          groupId={groupId}
          tenantId={tenantId}
          title={t`Calls by tool`}
          display="pie"
          breakoutColumn="tool_name"
          h={500}
        />
        <McpBreakoutChart
          provider={provider}
          table={table}
          groupMembersTable={groupMembersTable}
          dateFilter={dateFilter}
          userId={userId}
          groupId={groupId}
          tenantId={tenantId}
          title={t`Calls by user`}
          display="row"
          breakoutColumn="user_display_name"
          h={500}
        />
      </SimpleGrid>

      {hasErrors && (
        <>
          <Title order={3} mt="lg">{t`Errors`}</Title>
          <McpCallsTimelineChart
            provider={provider}
            table={table}
            groupMembersTable={groupMembersTable}
            dateFilter={dateFilter}
            userId={userId}
            groupId={groupId}
            tenantId={tenantId}
            title={t`Calls by status over time`}
            buildQuery={buildCallsByDayByStatusQuery}
          />
          <SimpleGrid cols={2} spacing="xl">
            <McpBreakoutChart
              provider={provider}
              table={table}
              groupMembersTable={groupMembersTable}
              dateFilter={dateFilter}
              userId={userId}
              groupId={groupId}
              tenantId={tenantId}
              title={t`Errors by type`}
              display="pie"
              breakoutColumn="error_type"
              errorsOnly
              h={500}
            />
            <McpBreakoutChart
              provider={provider}
              table={table}
              groupMembersTable={groupMembersTable}
              dateFilter={dateFilter}
              userId={userId}
              groupId={groupId}
              tenantId={tenantId}
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
  );
}
