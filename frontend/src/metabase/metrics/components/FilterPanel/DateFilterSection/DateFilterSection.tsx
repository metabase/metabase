import { useMemo } from "react";

import { getDatePickerValue } from "metabase/metrics/utils/dates";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as LibMetric from "metabase-lib/metric";

import { FilterSectionLayout } from "../FilterSectionLayout";
import type { FilterSectionWidgetProps } from "../types";

export function DateFilterSection({
  definition,
  filter,
  onRemove,
}: FilterSectionWidgetProps) {
  const filterInfo = useMemo(() => {
    const filterParts = LibMetric.filterParts(definition, filter);
    const filterValue = getDatePickerValue(definition, filter);
    if (filterParts == null || filterValue == null) {
      return null;
    }
    const dimensionInfo = LibMetric.displayInfo(
      definition,
      filterParts.dimension,
    );
    return { dimensionInfo, filterValue };
  }, [definition, filter]);

  if (filterInfo == null) {
    return null;
  }

  return (
    <FilterSectionLayout
      label={filterInfo.dimensionInfo.displayName}
      onRemove={onRemove}
    >
      {getDateFilterDisplayName(filterInfo.filterValue)}
    </FilterSectionLayout>
  );
}
