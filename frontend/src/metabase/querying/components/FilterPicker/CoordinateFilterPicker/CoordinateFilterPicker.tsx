import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { isNumber } from "metabase/lib/types";
import type { NumberValue } from "metabase/querying/hooks/use-coordinate-filter";
import { useCoordinateFilter } from "metabase/querying/hooks/use-coordinate-filter";
import { Box, Flex, NumberInput, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { MAX_WIDTH, MIN_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";

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

  const handleOperatorChange = (
    newOperator: Lib.CoordinateFilterOperatorName,
  ) => {
    setOperator(newOperator);
    setValues(getDefaultValues(newOperator, values));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const filter = getFilterClause(operator, secondColumn, values);
    if (filter) {
      onChange(filter);
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
        />
        <FilterPickerFooter isNew={isNew} canSubmit={isValid} />
      </Box>
    </Box>
  );
}

interface CoordinateValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
}

function CoordinateValueInput({
  query,
  stageIndex,
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: CoordinateValueInputProps) {
  if (hasMultipleValues) {
    return (
      <Box p="md" mah="25vh" style={{ overflow: "auto" }}>
        <NumberFilterValuePicker
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values.filter(isNumber)}
          autoFocus
          onChange={onChange}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberInput
          value={values[0]}
          placeholder={t`Enter a number`}
          autoFocus
          w="100%"
          aria-label={t`Filter value`}
          onChange={(newValue: number) => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" p="md">
        <NumberInput
          value={values[0]}
          placeholder={t`Min`}
          autoFocus
          onChange={(newValue: number) => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          placeholder={t`Max`}
          onChange={(newValue: number) => onChange([values[0], newValue])}
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
          placeholder="90"
          autoFocus
          onChange={(newValue: number) =>
            onChange([newValue, values[1], values[2], values[3]])
          }
        />
        <Flex align="center" justify="center" gap="sm">
          <NumberInput
            label={t`Left longitude`}
            value={values[1]}
            placeholder="-180"
            onChange={(newValue: number) =>
              onChange([values[0], newValue, values[2], values[3]])
            }
          />
          <NumberInput
            label={t`Right longitude`}
            value={values[3]}
            placeholder="180"
            onChange={(newValue: number) =>
              onChange([values[0], values[1], values[2], newValue])
            }
          />
        </Flex>
        <NumberInput
          label={t`Lower latitude`}
          value={values[2]}
          placeholder="-90"
          onChange={(newValue: number) =>
            onChange([values[0], values[1], newValue, values[3]])
          }
        />
      </Stack>
    );
  }

  return null;
}
