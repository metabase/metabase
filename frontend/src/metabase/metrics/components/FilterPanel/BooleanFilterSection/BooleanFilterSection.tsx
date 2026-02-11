import { t } from "ttag";

import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";
import type { FilterSectionWidgetProps } from "../types";

export function BooleanFilterSection({
  definition,
  filter,
  onRemove,
}: FilterSectionWidgetProps) {
  const filterParts = LibMetric.booleanFilterParts(definition, filter);
  if (filterParts == null) {
    return null;
  }

  const dimensionInfo = LibMetric.displayInfo(
    definition,
    filterParts.dimension,
  );

  return (
    <FilterSectionLayout
      label={dimensionInfo.displayName}
      onRemove={onRemove}
    >
      {getBooleanDisplayValue(filterParts)}
    </FilterSectionLayout>
  );
}

function getBooleanDisplayValue(
  filterParts: LibMetric.BooleanFilterParts,
): string {
  if (filterParts.operator === "=") {
    return filterParts.values[0] ? t`true` : t`false`;
  }
  return Lib.describeFilterOperator(filterParts.operator).toLowerCase();
}
