import { getDatePickerValue } from "metabase/metrics/utils/dates";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";

type DateFilterSectionProps = {
  definition: LibMetric.MetricDefinition;
  filter: LibMetric.FilterClause;
  onRemove: () => void;
};

export function DateFilterSection({
  definition,
  filter,
  onRemove,
}: DateFilterSectionProps) {
  const filterParts = LibMetric.filterParts(definition, filter);
  const filterValue = getDatePickerValue(definition, filter);
  if (filterParts == null || filterValue == null) {
    return null;
  }

  const dimensionInfo = LibMetric.displayInfo(
    definition,
    filterParts.dimension,
  );

  return (
    <FilterSectionLayout
      label={`${dimensionInfo.displayName}`}
      onRemove={onRemove}
    >
      {getDateFilterDisplayName(filterValue)}
    </FilterSectionLayout>
  );
}
