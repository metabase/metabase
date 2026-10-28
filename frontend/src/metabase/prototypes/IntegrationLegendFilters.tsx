import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { LegendFilters } from "./or-filters/directions/chart-filters/LegendFilters";

interface IntegrationLegendFiltersProps {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
}

export function IntegrationLegendFilters({
  query,
  onChange,
}: IntegrationLegendFiltersProps) {
  const hasSummary = Array.from(
    { length: Lib.stageCount(query) },
    (_, index) => index,
  ).some((index) => Lib.aggregations(query, index).length > 0);
  if (!hasSummary) {
    return null;
  }
  return (
    <Box px="lg" pt="sm" data-testid="integration-legend-filters">
      <LegendFilters query={query} onChange={onChange} />
    </Box>
  );
}
