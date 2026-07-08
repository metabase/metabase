import { useMemo } from "react";

import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";
import type { FilterSectionWidgetProps } from "../types";

export function CoordinateFilterSection({
  definition,
  filter,
  onRemove,
}: FilterSectionWidgetProps) {
  const filterInfo = useMemo(() => {
    const filterParts = LibMetric.coordinateFilterParts(definition, filter);
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
    return { filterParts, dimensionInfo, operatorName };
  }, [definition, filter]);

  if (filterInfo == null) {
    return null;
  }

  return (
    <FilterSectionLayout
      label={`${filterInfo.dimensionInfo.displayName} ${filterInfo.operatorName}`}
      onRemove={onRemove}
    >
      {filterInfo.filterParts.values.join(", ")}
    </FilterSectionLayout>
  );
}
