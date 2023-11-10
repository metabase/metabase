import { useState, useMemo } from "react";
import { t } from "ttag";
import { Box, Flex, NumberInput, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";
import { MAX_WIDTH } from "../constants";
import { getAvailableOperatorOptions } from "../utils";
import { ColumnValuesWidget } from "../ColumnValuesWidget";
import { FilterHeader } from "../FilterHeader";
import { FilterFooter } from "../FilterFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";
import { OPERATOR_OPTIONS } from "./constants";
import { getDefaultValues, hasValidValues } from "./utils";

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

  const [operator, setOperator] = useState(
    filterParts ? filterParts.operator : "=",
  );

  const [values, setValues] = useState(
    getDefaultValues(operator, filterParts?.values),
  );

  const { valueCount } = OPERATOR_OPTIONS[operator];
  const isValid = hasValidValues(operator, values);

  const handleOperatorChange = (operator: Lib.CoordinateFilterOperatorName) => {
    setOperator(operator);
    setValues(getDefaultValues(operator, values));
  };

  const handleSubmit = () => {
    if (isValid) {
      onChange(
        Lib.coordinateFilterClause({
          operator,
          column,
          longitudeColumn: column,
          values,
        }),
      );
    }
  };

  return (
    <Box
      component="form"
      maw={MAX_WIDTH}
      data-testid="number-filter-picker"
      onSubmit={handleSubmit}
    >
      <FilterHeader columnName={columnInfo.longDisplayName} onBack={onBack}>
        <FilterOperatorPicker
          value={operator}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </FilterHeader>
      <Box>
        <CoordinateValueInput
          values={values}
          valueCount={valueCount}
          column={column}
          onChange={setValues}
        />
        <FilterFooter
          isNew={isNew}
          canSubmit={isValid}
          onSubmit={handleSubmit}
        />
      </Box>
    </Box>
  );
}

interface CoordinateValueInputProps {
  values: (number | "")[];
  valueCount: number | undefined;
  column: Lib.ColumnMetadata;
  onChange: (values: (number | "")[]) => void;
}

function CoordinateValueInput({
  values,
  onChange,
  valueCount,
  column,
}: CoordinateValueInputProps) {
  const placeholder = t`Enter a number`;

  if (valueCount == null) {
    return (
      <FlexWithScroll p="md" mah={300}>
        <ColumnValuesWidget
          value={values}
          column={column}
          canHaveManyValues
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
