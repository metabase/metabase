import { t } from "ttag";

import { SimpleGrid, Stack } from "metabase/ui";

import { ApiKeyLivenessTable } from "./ApiKeyLivenessTable";
import { ApiKeyUsageBreakoutChart } from "./ApiKeyUsageBreakoutChart";
import { ApiKeyUsageCallsTimelineChart } from "./ApiKeyUsageCallsTimelineChart";
import { useApiKeyUsageContext } from "./context";

export function ApiKeyUsagePage() {
  const {
    dataSources: { provider, table, groupMembersTable },
    chartFilters: { dateFilter, userId, groupId, tenantId },
  } = useApiKeyUsageContext();

  return (
    <Stack gap="xl">
      <ApiKeyUsageCallsTimelineChart
        provider={provider}
        table={table}
        groupMembersTable={groupMembersTable}
        dateFilter={dateFilter}
        userId={userId}
        groupId={groupId}
        tenantId={tenantId}
        title={t`Calls over time`}
      />
      <SimpleGrid cols={2} spacing="xl">
        <ApiKeyUsageBreakoutChart
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
        <ApiKeyUsageBreakoutChart
          provider={provider}
          table={table}
          groupMembersTable={groupMembersTable}
          dateFilter={dateFilter}
          userId={userId}
          groupId={groupId}
          tenantId={tenantId}
          title={t`Calls by route`}
          display="row"
          breakoutColumn="route_template"
          h={500}
        />
      </SimpleGrid>
      <SimpleGrid cols={2} spacing="xl">
        <ApiKeyUsageBreakoutChart
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
        <ApiKeyLivenessTable title={t`Key activity`} h={500} />
      </SimpleGrid>
    </Stack>
  );
}
