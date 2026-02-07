import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";

type StringFilterSectionProps = {
  definition: LibMetric.MetricDefinition;
  filter: LibMetric.FilterClause;
  onRemove: () => void;
};

export function StringFilterSection({
  definition,
  filter,
  onRemove,
}: StringFilterSectionProps) {
  const filterParts = LibMetric.stringFilterParts(definition, filter);
  if (filterParts == null) {
    return null;
  }

  const dimensionInfo = LibMetric.displayInfo(
    definition,
    filterParts.dimension,
  );
  const operatorName = Lib.describeFilterOperator(
    filterParts.operator,
  ).toLowerCase();

  return (
    <FilterSectionLayout
      label={`${dimensionInfo.displayName} ${operatorName}`}
      onRemove={onRemove}
    >
      {filterParts.values.join(", ")}
    </FilterSectionLayout>
  );
}
