import * as LibMetric from "metabase-lib/metric";

import { BooleanFilterSection } from "../BooleanFilterSection";
import { CoordinateFilterSection } from "../CoordinateFilterSection";
import { DateFilterSection } from "../DateFilterSection";
import { NumberFilterSection } from "../NumberFilterSection";
import { StringFilterSection } from "../StringFilterSection";
import { TimeFilterSection } from "../TimeFilterSection";

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
  const FilterSectionWidget = getFilterSection(definition, filter);
  if (FilterSectionWidget == null) {
    return null;
  }

  return (
    <FilterSectionWidget
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

  if (LibMetric.isNumeric(filterParts.dimension)) {
    return NumberFilterSection;
  }

  if (LibMetric.isBoolean(filterParts.dimension)) {
    return BooleanFilterSection;
  }

  if (LibMetric.isCoordinate(filterParts.dimension)) {
    return CoordinateFilterSection;
  }

  if (LibMetric.isTime(filterParts.dimension)) {
    return TimeFilterSection;
  }

  return null;
}
