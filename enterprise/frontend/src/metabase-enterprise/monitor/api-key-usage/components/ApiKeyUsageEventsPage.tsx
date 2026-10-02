import { ApiKeyUsageEventsTable } from "./ApiKeyUsageEventsTable";
import { useApiKeyUsageContext } from "./context";

export function ApiKeyUsageEventsPage() {
  const {
    dataSources: { provider, table, groupMembersTable },
    chartFilters: { dateFilter, apiKeyId, userId, groupId },
    hasPii,
    page,
    total,
    onPageChange,
    sortingOptions,
    onSortingOptionsChange,
  } = useApiKeyUsageContext();

  return (
    <ApiKeyUsageEventsTable
      provider={provider}
      table={table}
      groupMembersTable={groupMembersTable}
      dateFilter={dateFilter}
      apiKeyId={apiKeyId}
      userId={userId}
      groupId={groupId}
      hasPii={hasPii}
      page={page}
      total={total}
      onPageChange={onPageChange}
      sortingOptions={sortingOptions}
      onSortingOptionsChange={onSortingOptionsChange}
    />
  );
}
