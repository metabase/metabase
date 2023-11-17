import { useState, useMemo } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { Box, Flex, NumberInput, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import { getAvailableOperatorOptions } from "../utils";
import { FilterValuesWidget } from "../FilterValuesWidget";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, getFilterClause, hasValidValues } from "./utils";
import type { NumberValue } from "./types";

export function NumberFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const filterParts = useMemo(
    () => (filter ? Lib.numberFilterParts(query, stageIndex, filter) : null),
    [query, stageIndex, filter],
  );

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : "=",
  );

  const [values, setValues] = useState(() =>
    getDefaultValues(operator, filterParts?.values),
  );

  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const handleOperatorChange = (operator: Lib.NumberFilterOperatorName) => {
    setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onChange(getFilterClause(operator, column, values));
    }
  };

  return (
    <Box
      component="form"
      miw={MIN_WIDTH}
      maw={MAX_WIDTH}
      data-testid="number-filter-picker"
      onSubmit={handleSubmit}
    >
      <FilterPickerHeader
        columnName={columnInfo.longDisplayName}
        onBack={onBack}
      >
        <FilterOperatorPicker
          value={operator}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </FilterPickerHeader>
      <div>
        <NumberValueInput
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid} />
      </div>
    </Box>
  );
}

interface NumberValueInputProps {
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
}

function NumberValueInput({
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  const placeholder = t`Enter a number`;

  if (hasMultipleValues) {
    return (
      <FlexWithScroll p="md" mah={300}>
        <FilterValuesWidget
          value={values}
          column={column}
          hasMultipleValues
          onChange={onChange}
        />
      </FlexWithScroll>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberInput
          value={values[0]}
          onChange={newValue => onChange([newValue])}
          placeholder={placeholder}
          autoFocus
          w="100%"
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" p="md">
        <NumberInput
          value={values[0]}
          onChange={(newValue: number) => onChange([newValue, values[1]])}
          placeholder={placeholder}
          autoFocus
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          onChange={(newValue: number) => onChange([values[0], newValue])}
          placeholder={placeholder}
        />
      </Flex>
    );
  }

  return null;
}
