import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Flex, Text, TimeInput } from "metabase/ui";
import * as Lib from "metabase-lib";

import { MAX_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterHeader } from "../FilterHeader";
import { FilterFooter } from "../FilterFooter";

import { OPERATOR_OPTIONS } from "./constants";
import {
  getDefaultValue,
  getDefaultValuesForOperator,
  getNextValues,
  isFilterValid,
} from "./utils";

export function TimeFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  isNew,
  onChange,
  onBack,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;

  const filterParts = filter
    ? Lib.timeFilterParts(query, stageIndex, filter)
    : null;

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operatorName, setOperatorName] = useState(
    filterParts?.operator ?? "<",
  );

  const [values, setValues] = useState(
    filterParts?.values ?? getDefaultValuesForOperator(operatorName),
  );

  const { valueCount = 0 } = OPERATOR_OPTIONS[operatorName] ?? {};

  const isValid = useMemo(
    () => isFilterValid(operatorName, values),
    [operatorName, values],
  );

  const handleOperatorChange = (
    nextOperatorName: Lib.TimeFilterOperatorName,
  ) => {
    const nextOption = OPERATOR_OPTIONS[nextOperatorName];
    const nextValues = getNextValues(values, nextOption.valueCount);
    setOperatorName(nextOperatorName);
    setValues(nextValues);
  };

  const handleFilterChange = () => {
    onChange(
      Lib.timeFilterClause({
        operator: operatorName,
        column,
        values,
      }),
    );
  };

  return (
    <Box maw={MAX_WIDTH} data-testid="time-filter-picker">
      <FilterHeader columnName={columnName} onBack={onBack}>
        <FilterOperatorPicker
          value={operatorName}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </FilterHeader>
      <Box>
        {valueCount > 0 && (
          <Flex p="md">
            <ValuesInput
              values={values}
              valueCount={valueCount}
              onChange={setValues}
            />
          </Flex>
        )}
        <FilterFooter
          isNew={isNew}
          canSubmit={isValid}
          onSubmit={handleFilterChange}
        />
      </Box>
    </Box>
  );
}

interface ValuesInputProps {
  values: Date[];
  valueCount: number;
  onChange: (values: Date[]) => void;
}

function ValuesInput({ values, valueCount, onChange }: ValuesInputProps) {
  if (valueCount === 1) {
    const [value = getDefaultValue()] = values;
    return (
      <TimeInput
        value={value}
        onChange={newValue => onChange([newValue])}
        w="100%"
      />
    );
  }

  if (valueCount === 2) {
    const [value1 = getDefaultValue(), value2 = getDefaultValue()] = values;
    return (
      <Flex direction="row" align="center" gap="sm" w="100%">
        <TimeInput
          value={value1}
          onChange={newValue1 => onChange([newValue1, value2])}
          w="100%"
        />
        <Text>{t`and`}</Text>
        <TimeInput
          value={value2}
          onChange={newValue2 => onChange([value1, newValue2])}
          w="100%"
        />
      </Flex>
    );
  }

  return null;
}
