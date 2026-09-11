import { ApiKeyUsageEventsTable } from "./ApiKeyUsageEventsTable";
import { useApiKeyUsageContext } from "./context";

export function ApiKeyUsageEventsPage() {
  const {
    dataSources: { provider, table, groupMembersTable },
    chartFilters: { dateFilter, userId, groupId, tenantId },
    hasTenants,
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
      userId={userId}
      groupId={groupId}
      tenantId={tenantId}
      hasTenants={hasTenants}
      hasPii={hasPii}
      page={page}
      total={total}
      onPageChange={onPageChange}
      sortingOptions={sortingOptions}
      onSortingOptionsChange={onSortingOptionsChange}
    />
  );
}
