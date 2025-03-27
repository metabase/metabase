import type { FormEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import {
  type NumberOrEmptyValue,
  useCoordinateFilter,
} from "metabase/querying/filters/hooks/use-coordinate-filter";
import { Box, Flex, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { NumberFilterInput } from "../../NumberFilterInput";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterPickerFooter } from "../FilterPickerFooter";
import { FilterPickerHeader } from "../FilterPickerHeader";
import { WIDTH } from "../constants";
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

  const handleOperatorChange = (newOperator: Lib.CoordinateFilterOperator) => {
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
      w={WIDTH}
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
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
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
          values={values.filter(isNotNull)}
          autoFocus
          onChange={onChange}
        />
      </Box>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Enter a number`}
          autoFocus
          w="100%"
          aria-label={t`Filter value`}
          onChange={(newValue) => onChange([newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center" justify="center" p="md">
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Min`}
          autoFocus
          onChange={(newValue) => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberFilterInput
          value={values[1]}
          placeholder={t`Max`}
          onChange={(newValue) => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 4) {
    return (
      <Stack align="center" justify="center" gap="sm" p="md">
        <NumberFilterInput
          label={t`Upper latitude`}
          value={values[0]}
          placeholder="90"
          autoFocus
          onChange={(newValue) =>
            onChange([newValue, values[1], values[2], values[3]])
          }
        />
        <Flex align="center" justify="center" gap="sm">
          <NumberFilterInput
            label={t`Left longitude`}
            value={values[1]}
            placeholder="-180"
            onChange={(newValue) =>
              onChange([values[0], newValue, values[2], values[3]])
            }
          />
          <NumberFilterInput
            label={t`Right longitude`}
            value={values[3]}
            placeholder="180"
            onChange={(newValue) =>
              onChange([values[0], values[1], values[2], newValue])
            }
          />
        </Flex>
        <NumberFilterInput
          label={t`Lower latitude`}
          value={values[2]}
          placeholder="-90"
          onChange={(newValue) =>
            onChange([values[0], values[1], newValue, values[3]])
          }
        />
      </Stack>
    );
  }

  return null;
}
