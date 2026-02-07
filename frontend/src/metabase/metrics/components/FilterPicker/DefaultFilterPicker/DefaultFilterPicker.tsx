import type { FormEvent } from "react";
import { useMemo } from "react";

import { Box, Radio, Stack } from "metabase/ui";
import * as LibMetric from "metabase-lib/metric";

import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

import { useDefaultFilter } from "./hooks";

export function DefaultFilterPicker({
  definition,
  dimension,
  filter,
  isNew,
  onBack,
  onSelect,
  readOnly,
}: FilterPickerWidgetProps) {
  const dimensionInfo = useMemo(
    () => LibMetric.displayInfo(definition, dimension),
    [definition, dimension],
  );

  const { operator, availableOptions, getFilterClause, setOperator } =
    useDefaultFilter({
      definition,
      dimension,
      filter,
      hasInitialOperator: true,
    });

  const handleOperatorChange = (operator: string) => {
    const option = availableOptions.find(
      (option) => option.operator === operator,
    );
    if (option) {
      setOperator(option.operator);
    }
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    const filter = getFilterClause(operator);
    if (filter) {
      onSelect(filter);
    }
  };

  return (
    <Box
      component="form"
      miw={WIDTH}
      data-testid="default-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        dimensionName={dimensionInfo.displayName}
        onBack={onBack}
        readOnly={readOnly}
      />
      <div>
        <Radio.Group value={operator} onChange={handleOperatorChange}>
          <Stack p="md" gap="sm">
            {availableOptions.map((option) => (
              <Radio
                key={option.operator}
                value={option.operator}
                label={option.displayName}
                pb={6}
                size="xs"
              />
            ))}
          </Stack>
        </Radio.Group>
        <FilterPickerFooter isNew={isNew} isValid />
      </div>
    </Box>
  );
}
