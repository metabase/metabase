import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import {
  type UiCoordinateFilterOperator,
  useCoordinateFilter,
} from "metabase/querying/filters/hooks/use-coordinate-filter";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";

import { CoordinateColumnPicker } from "./CoordinateColumnPicker";
import { CoordinateValueInput } from "./CoordinateValueInput";

export function CoordinateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  withAddButton,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const {
    operator,
    availableOptions,
    secondColumn,
    availableColumns,
    canPickColumns,
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setSecondColumn,
    setValues,
  } = useCoordinateFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const [leftInclusive, setLeftInclusive] = useState(true);
  const [rightInclusive, setRightInclusive] = useState(true);

  const handleOperatorChange = (newOperator: UiCoordinateFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator, secondColumn, values);
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
      w={WIDTH}
      data-testid="coordinate-filter-picker"
      onSubmit={handleFormSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOptions}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      <Box>
        {canPickColumns && (
          <CoordinateColumnPicker
            query={query}
            stageIndex={stageIndex}
            column={column}
            secondColumn={secondColumn}
            availableColumns={availableColumns}
            onChange={setSecondColumn}
          />
        )}
        <CoordinateValueInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
          leftInclusive={leftInclusive}
          rightInclusive={rightInclusive}
          onLeftInclusiveChange={setLeftInclusive}
          onRightInclusiveChange={setRightInclusive}
        />
        <FilterPickerFooter
          isNew={isNew}
          isValid={isValid}
          withAddButton={withAddButton}
          onAddButtonClick={handleAddButtonClick}
        />
      </Box>
    </Box>
  );
}
