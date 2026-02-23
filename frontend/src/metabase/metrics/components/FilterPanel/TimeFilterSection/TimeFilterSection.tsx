import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";
import type { FilterSectionWidgetProps } from "../types";

export function TimeFilterSection({
  definition,
  filter,
  onRemove,
}: FilterSectionWidgetProps) {
  const filterParts = LibMetric.timeFilterParts(definition, filter);
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

  const formattedValues = filterParts.values
    .map((d) => d.toLocaleTimeString())
    .join(", ");

  return (
    <FilterSectionLayout
      label={`${dimensionInfo.displayName} ${operatorName}`}
      onRemove={onRemove}
    >
      {formattedValues}
    </FilterSectionLayout>
  );
}
