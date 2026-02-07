import type { FormEvent } from "react";
import { useMemo } from "react";

import { BooleanPicker } from "metabase/querying/common/components/BooleanPicker";
import { Box } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

import { useBooleanFilter } from "./hooks";

export function BooleanFilterPicker({
  definition,
  dimension,
  filter,
  isNew,
  readOnly,
  onSelect,
  onBack,
}: FilterPickerWidgetProps) {
  const dimensionInfo = useMemo(
    () => LibMetric.displayInfo(definition, dimension),
    [definition, dimension],
  );

  const { value, getFilterClause, setValue } = useBooleanFilter({
    definition,
    dimension,
    filter,
  });

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSelect(getFilterClause());
  };

  return (
    <Box
      component="form"
      miw={WIDTH}
      data-testid="boolean-filter-picker"
      onSubmit={handleFormSubmit}
    >
      {onBack && (
        <FilterPickerHeader
          dimensionName={dimensionInfo.displayName}
          onBack={onBack}
          readOnly={readOnly}
        />
      )}
      <BooleanPicker value={value} withEmptyOptions onChange={setValue} />
      <FilterPickerFooter isNew={isNew} isValid />
    </Box>
  );
}
