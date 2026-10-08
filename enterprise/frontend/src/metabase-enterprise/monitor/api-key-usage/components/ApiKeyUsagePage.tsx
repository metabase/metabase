import { t } from "ttag";

import { SimpleGrid, Stack } from "metabase/ui";

import { ApiKeyActivityTable } from "./ApiKeyActivityTable";
import { ApiKeyUsageBreakoutChart } from "./ApiKeyUsageBreakoutChart";
import { ApiKeyUsageCallsTimelineChart } from "./ApiKeyUsageCallsTimelineChart";
import { useApiKeyUsageContext } from "./context";

export function ApiKeyUsagePage() {
  const {
    dataSources: { provider, table, groupMembersTable },
    chartFilters: { dateFilter, apiKeyId, userId, groupId },
  } = useApiKeyUsageContext();

  return (
    <Stack gap="xl">
      <ApiKeyActivityTable
        provider={provider}
        table={table}
        groupMembersTable={groupMembersTable}
        dateFilter={dateFilter}
        apiKeyId={apiKeyId}
        userId={userId}
        groupId={groupId}
        title={t`Key activity`}
        h={500}
      />
      <ApiKeyUsageCallsTimelineChart
        provider={provider}
        table={table}
        groupMembersTable={groupMembersTable}
        dateFilter={dateFilter}
        apiKeyId={apiKeyId}
        userId={userId}
        groupId={groupId}
        title={t`Calls over time`}
      />
      <SimpleGrid cols={2} spacing="xl">
        <ApiKeyUsageBreakoutChart
          provider={provider}
          table={table}
          groupMembersTable={groupMembersTable}
          dateFilter={dateFilter}
          apiKeyId={apiKeyId}
          userId={userId}
          groupId={groupId}
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
          apiKeyId={apiKeyId}
          userId={userId}
          groupId={groupId}
          title={t`Calls by route`}
          display="row"
          breakoutColumn="route_template"
          h={500}
        />
      </SimpleGrid>
    </Stack>
  );
}
