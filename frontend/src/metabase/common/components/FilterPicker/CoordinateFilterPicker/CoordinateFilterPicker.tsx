import { useMemo } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { Box, Flex, NumberInput, Stack, Text } from "metabase/ui";
import { useCoordinateFilter } from "metabase/common/hooks/filters/use-coordinate-filter";
import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import { FilterValuesWidget } from "../FilterValuesWidget";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

import { CoordinateColumnPicker } from "./CoordinateColumnPicker";

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

  const {
    operator,
    values,
    secondColumn,
    isValid,
    valueCount,
    hasMultipleValues,
    availableOperators,
    availableColumns,
    canPickColumns,
    setOperator,
    setSecondColumn,
    setValues,
    getFilterClause,
  } = useCoordinateFilter({ query, stageIndex, column, filter });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextFilter = getFilterClause();
    if (nextFilter) {
      onChange(nextFilter);
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
          onChange={setOperator}
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

type NumberValue = number | "";

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
          autoFocus
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
