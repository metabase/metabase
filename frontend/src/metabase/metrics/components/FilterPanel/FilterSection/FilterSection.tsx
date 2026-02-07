import * as LibMetric from "metabase-lib/metric";

import { DateFilterSection } from "../DateFilterSection";
import { StringFilterSection } from "../StringFilterSection";

type FilterSectionProps = {
  definition: LibMetric.MetricDefinition;
  filter: LibMetric.FilterClause;
  onRemove: () => void;
};

export function FilterSection({
  definition,
  filter,
  onRemove,
}: FilterSectionProps) {
  const FilterSection = getFilterSection(definition, filter);
  if (FilterSection == null) {
    return null;
  }

  return (
    <FilterSection
      definition={definition}
      filter={filter}
      onRemove={onRemove}
    />
  );
}

function getFilterSection(
  definition: LibMetric.MetricDefinition,
  filter: LibMetric.FilterClause,
) {
  const filterParts = LibMetric.filterParts(definition, filter);
  if (filterParts == null) {
    return null;
  }

  if (LibMetric.isStringOrStringLike(filterParts.dimension)) {
    return StringFilterSection;
  }

  if (LibMetric.isDateOrDateTime(filterParts.dimension)) {
    return DateFilterSection;
  }

  return null;
}
