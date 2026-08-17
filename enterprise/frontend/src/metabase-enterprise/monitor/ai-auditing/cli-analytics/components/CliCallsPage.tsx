import { useCliAnalyticsContext } from "./CliAnalyticsSectionLayout";
import { CliEventsTable } from "./CliEventsTable";

export function CliCallsPage() {
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
  } = useCliAnalyticsContext();

  return (
    <CliEventsTable
      {...dataSources}
      {...chartFilters}
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
