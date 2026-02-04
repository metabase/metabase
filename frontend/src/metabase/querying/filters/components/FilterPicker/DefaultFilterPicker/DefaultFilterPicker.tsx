import type { FormEvent } from "react";
import { useMemo } from "react";

import { Box, Radio, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useDefaultFilter } from "../../../hooks/use-default-filter";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";

export function DefaultFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  withSubmitButton,
  onBack,
  onChange,
  readOnly,
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
      (option) => option.operator === operator,
    );
    if (option) {
      setOperator(option.operator);
    }
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator);
    if (filter) {
      onChange(filter, opts);
    }
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    handleFilterChange({ run: true });
  };

  const handleAddButtonClick = () => {
    handleFilterChange({ run: false });
  };

  return (
    <Box
      component="form"
      miw={WIDTH}
      data-testid="default-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
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
        <FilterPickerFooter
          isNew={isNew}
          isValid
          withAddButton={withAddButton}
          withSubmitButton={withSubmitButton}
          onAddButtonClick={handleAddButtonClick}
        />
      </div>
    </Box>
  );
}
