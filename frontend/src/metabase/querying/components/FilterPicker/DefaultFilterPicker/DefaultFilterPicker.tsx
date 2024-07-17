import type { FormEvent } from "react";
import { useMemo } from "react";

import { Box, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useDefaultFilter } from "../../../hooks/use-default-filter";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { MIN_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

export function DefaultFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const { operator, availableOptions, getFilterClause, setOperator } =
    useDefaultFilter({
      query,
      stageIndex,
      column,
      filter,
      hasInitialOperator: true,
    });

  const handleOperatorChange = (operator: string) => {
    const option = availableOptions.find(
      option => option.operator === operator,
    );
    if (option) {
      setOperator(option.operator);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const filter = getFilterClause(operator);
    if (filter) {
      onChange(filter);
    }
  };

  return (
    <Box
      component="form"
      miw={MIN_WIDTH}
      data-testid="default-filter-picker"
      onSubmit={handleSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      />
      <div>
        <Radio.Group value={operator} onChange={handleOperatorChange}>
          <Stack p="md" spacing="sm">
            {availableOptions.map(option => (
              <Radio
                key={option.operator}
                value={option.operator}
                label={option.name}
                pb={6}
                size="xs"
              />
            ))}
          </Stack>
        </Radio.Group>
        <FilterPickerFooter isNew={isNew} canSubmit />
      </div>
    </Box>
  );
}
