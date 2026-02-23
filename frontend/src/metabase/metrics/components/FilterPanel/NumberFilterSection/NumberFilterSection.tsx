import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";
import type { FilterSectionWidgetProps } from "../types";

export function NumberFilterSection({
  definition,
  filter,
  onRemove,
}: FilterSectionWidgetProps) {
  const filterParts = LibMetric.numberFilterParts(definition, filter);
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
