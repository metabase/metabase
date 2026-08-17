import { useMcpAnalyticsContext } from "./McpAnalyticsSectionLayout";
import { McpEventsTable } from "./McpEventsTable";

export function McpEventsPage() {
  const {
    dataSources,
    chartFilters,
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
      {...dataSources}
      {...chartFilters}
      hasTenants={hasTenants}
      hasPii={hasPii}
      page={page}
      total={total}
      onPageChange={(newPage) => onPageChange(newPage, { immediate: true })}
      sortingOptions={sortingOptions}
      onSortingOptionsChange={onSortingOptionsChange}
    />
  );
}
