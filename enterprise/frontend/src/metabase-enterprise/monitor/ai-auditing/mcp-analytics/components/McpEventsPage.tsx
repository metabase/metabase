import { McpEventsTable } from "./McpEventsTable";
import { useMcpAnalyticsContext } from "./context";

export function McpEventsPage() {
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
  } = useMcpAnalyticsContext();

  return (
    <McpEventsTable
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
