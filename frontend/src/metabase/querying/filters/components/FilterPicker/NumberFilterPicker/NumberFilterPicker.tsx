import { useMemo, useState } from "react";

import { useNumberFilter } from "metabase/querying/filters/hooks/use-number-filter";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
import type { FilterChangeOpts, FilterPickerWidgetProps } from "../types";

import { NumberValueInput } from "./NumberValueInput";

export function NumberFilterPicker({
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
    values,
    valueCount,
    hasMultipleValues,
    isValid,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const [chevronState, setChevronState] = useState({
    leftInclusive: true,
    rightInclusive: true,
  });

  const handleChevronChange = (side: "left" | "right", value: boolean) => {
    setChevronState((prev) => ({
      ...prev,
      [side === "left" ? "leftInclusive" : "rightInclusive"]: value,
    }));
  };

  const handleOperatorChange = (newOperator: Lib.NumberFilterOperator) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
    if (newOperator === "between") {
      setChevronState({ leftInclusive: true, rightInclusive: true });
    }
  };

  const handleFilterChange = (opts: FilterChangeOpts) => {
    const filter = getFilterClause(operator, values);
    if (filter) {
      onChange(filter, opts);
    }
  };

  const handleFormSubmit = (event: React.FormEvent) => {
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
      data-testid="number-filter-picker"
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
      <div>
        <NumberValueInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
          chevronState={operator === "between" ? chevronState : undefined}
          onChevronChange={
            operator === "between" ? handleChevronChange : undefined
          }
        />
        <FilterPickerFooter
          isNew={isNew}
          isValid={isValid}
          withSeparator={false}
          withAddButton={withAddButton}
          onAddButtonClick={handleAddButtonClick}
        />
      </div>
    </Box>
  );
}
