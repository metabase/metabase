import { useState, useMemo } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { Box, Flex, NumberInput, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import { getAvailableOperatorOptions } from "../utils";
import { FilterValuesWidget } from "../FilterValuesWidget";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";
import { CoordinateColumnPicker } from "./CoordinateColumnPicker";
import { OPERATOR_OPTIONS } from "./constants";
import {
  canPickColumns,
  getAvailableColumns,
  getDefaultSecondColumn,
  getDefaultValues,
  getFilterClause,
  hasValidValues,
} from "./utils";
import type { NumberValue } from "./types";

export function CoordinateFilterPicker({
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
    () =>
      filter ? Lib.coordinateFilterParts(query, stageIndex, filter) : null,
    [query, stageIndex, filter],
  );

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const availableColumns = useMemo(
    () => getAvailableColumns(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : "=",
  );
  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts?.values),
  );
  const [secondColumn, setSecondColumn] = useState(
    getDefaultSecondColumn(availableColumns, filterParts?.longitudeColumn),
  );

  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const handleOperatorChange = (operator: Lib.CoordinateFilterOperatorName) => {
    setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onChange(getFilterClause(operator, column, secondColumn, values));
    }
  };

  return (
    <Box
      component="form"
      miw={MIN_WIDTH}
      maw={MAX_WIDTH}
      data-testid="coordinate-filter-picker"
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
      <Box>
        {canPickColumns(operator, availableColumns) && (
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
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid} />
      </Box>
    </Box>
  );
}

interface CoordinateValueInputProps {
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
}

function CoordinateValueInput({
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: CoordinateValueInputProps) {
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
          onChange={(newValue: number) => onChange([newValue])}
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

  if (valueCount === 4) {
    return (
      <Stack align="center" justify="center" spacing="sm" p="md">
        <NumberInput
          label={t`Upper latitude`}
          value={values[0]}
          onChange={(newValue: number) =>
            onChange([newValue, values[1], values[2], values[3]])
          }
          placeholder="90"
          autoFocus
        />
        <Flex align="center" justify="center" gap="sm">
          <NumberInput
            label={t`Left longitude`}
            value={values[1]}
            onChange={(newValue: number) =>
              onChange([values[0], newValue, values[2], values[3]])
            }
            placeholder="-180"
          />
          <NumberInput
            label={t`Right longitude`}
            value={values[3]}
            onChange={(newValue: number) =>
              onChange([values[0], values[1], values[2], newValue])
            }
            placeholder="180"
          />
        </Flex>
        <NumberInput
          label={t`Lower latitude`}
          value={values[2]}
          onChange={(newValue: number) =>
            onChange([values[0], values[1], newValue, values[3]])
          }
          placeholder="-90"
        />
      </Stack>
    );
  }

  return null;
}
