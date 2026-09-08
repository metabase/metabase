import { t } from "ttag";

import { SimpleGrid, Stack, Title } from "metabase/ui";
import { buildCallsByDayByStatusQuery } from "metabase-enterprise/monitor/ai-auditing/cli-analytics/query-utils";

import { CliBreakoutChart } from "./CliBreakoutChart";
import { CliCallerLivenessTable } from "./CliCallerLivenessTable";
import { CliCallsTimelineChart } from "./CliCallsTimelineChart";
import { useCliAnalyticsContext } from "./context";

export function CliUsagePage() {
  const {
    dataSources: { provider, table, groupMembersTable },
    chartFilters: { dateFilter, userId, groupId, tenantId },
    hasErrors,
  } = useCliAnalyticsContext();

  return (
    <Stack gap="xl">
      <CliCallsTimelineChart
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
        <CliBreakoutChart
          provider={provider}
          table={table}
          groupMembersTable={groupMembersTable}
          dateFilter={dateFilter}
          userId={userId}
          groupId={groupId}
          tenantId={tenantId}
          title={t`Calls by client`}
          display="pie"
          breakoutColumn="client_display_name"
          h={500}
        />
        <CliBreakoutChart
          provider={provider}
          table={table}
          groupMembersTable={groupMembersTable}
          dateFilter={dateFilter}
          userId={userId}
          groupId={groupId}
          tenantId={tenantId}
          title={t`Calls by operation`}
          display="row"
          breakoutColumn="operation"
          h={500}
        />
      </SimpleGrid>
      <SimpleGrid cols={2} spacing="xl">
        <CliBreakoutChart
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
        <CliCallerLivenessTable
          provider={provider}
          table={table}
          groupMembersTable={groupMembersTable}
          dateFilter={dateFilter}
          userId={userId}
          groupId={groupId}
          tenantId={tenantId}
          title={t`User activity`}
          h={500}
        />
      </SimpleGrid>

      {hasErrors && (
        <>
          <Title order={3} mt="lg">{t`Errors`}</Title>
          <CliCallsTimelineChart
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
          <CliBreakoutChart
            provider={provider}
            table={table}
            groupMembersTable={groupMembersTable}
            dateFilter={dateFilter}
            userId={userId}
            groupId={groupId}
            tenantId={tenantId}
            title={t`Errors by operation`}
            display="row"
            breakoutColumn="operation"
            errorsOnly
            h={500}
          />
        </>
      )}
    </Stack>
  );
}
