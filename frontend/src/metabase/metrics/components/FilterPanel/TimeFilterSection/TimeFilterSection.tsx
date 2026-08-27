import { useMemo } from "react";

import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";
import type { FilterSectionWidgetProps } from "../types";

export function TimeFilterSection({
  definition,
  filter,
  onRemove,
}: FilterSectionWidgetProps) {
  const filterInfo = useMemo(() => {
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
      .map((date) => date.toLocaleTimeString())
      .join(", ");
    return { dimensionInfo, operatorName, formattedValues };
  }, [definition, filter]);

  if (filterInfo == null) {
    return null;
  }

  return (
    <FilterSectionLayout
      label={`${filterInfo.dimensionInfo.displayName} ${filterInfo.operatorName}`}
      onRemove={onRemove}
    >
      {filterInfo.formattedValues}
    </FilterSectionLayout>
  );
}
