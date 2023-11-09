import { t } from "ttag";
import { useState, useMemo } from "react";

import { Box, Flex, NumberInput, Text, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { MAX_WIDTH } from "../constants";
import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { ColumnValuesWidget } from "../ColumnValuesWidget";
import { FilterHeader } from "../FilterHeader";
import { FilterFooter } from "../FilterFooter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FlexWithScroll } from "../FilterPicker.styled";

import { OPERATOR_OPTIONS } from "./constants";
import { findSecondColumn, isFilterValid } from "./utils";
import { CoordinateColumnSelect } from "./CoordinateColumnSelect";

export function CoordinateFilterPicker({
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
    ? Lib.coordinateFilterParts(query, stageIndex, filter)
    : null;

  const availableOperators = useMemo(
    () =>
      getAvailableOperatorOptions(query, stageIndex, column, OPERATOR_OPTIONS),
    [query, stageIndex, column],
  );

  const [operatorName, setOperatorName] = useState(
    filterParts?.operator ?? "=",
  );
  const [values, setValues] = useState(filterParts?.values ?? []);
  const [column2, setColumn2] = useState(
    findSecondColumn({ query, stageIndex, column, filter, operatorName }),
  );

  const { valueCount = 0 } = OPERATOR_OPTIONS[operatorName] ?? {};

  const isValid = useMemo(
    () => isFilterValid(operatorName, values),
    [operatorName, values],
  );

  const handleOperatorChange = (
    nextOperatorName: Lib.CoordinateFilterOperatorName,
  ) => {
    const nextOption = OPERATOR_OPTIONS[nextOperatorName];
    const nextValues =
      nextOperatorName === "inside"
        ? []
        : values.slice(0, nextOption.valueCount);

    setOperatorName(nextOperatorName);
    setValues(nextValues);
    setColumn2(
      findSecondColumn({
        query,
        stageIndex,
        column,
        filter,
        operatorName: nextOperatorName,
      }),
    );
  };

  const handleFilterChange = () => {
    if (operatorName === "inside" && column2) {
      const [latitudeColumn, longitudeColumn] = Lib.isLatitude(column)
        ? [column, column2]
        : [column2, column];

      onChange(
        Lib.coordinateFilterClause({
          operator: operatorName,
          column: latitudeColumn,
          longitudeColumn,
          values,
        }),
      );
    } else {
      onChange(
        Lib.coordinateFilterClause({
          operator: operatorName,
          column,
          values,
        }),
      );
    }
  };

  return (
    <Box maw={MAX_WIDTH} data-testid="coordinate-filter-picker">
      <FilterHeader columnName={columnName} onBack={onBack}>
        <FilterOperatorPicker
          value={operatorName}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </FilterHeader>
      <Box>
        {operatorName === "inside" && (
          <CoordinateColumnSelect
            query={query}
            stageIndex={stageIndex}
            column={column}
            value={column2}
            onChange={(newCol2: Lib.ColumnMetadata) => setColumn2(newCol2)}
          />
        )}
        <CoordinateValueInput
          values={values}
          valueCount={valueCount ?? 0}
          column={column}
          onChange={setValues}
        />
        <FilterFooter
          isNew={isNew}
          canSubmit={isValid}
          onSubmit={handleFilterChange}
        />
      </Box>
    </Box>
  );
}

interface CoordinateValueInputProps {
  values: number[];
  valueCount: number;
  column: Lib.ColumnMetadata;
  onChange: (values: number[]) => void;
}

function CoordinateValueInput({
  values,
  onChange,
  valueCount,
  column,
}: CoordinateValueInputProps) {
  const placeholder = t`Enter a number`;

  switch (valueCount) {
    case Infinity:
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
    case 1:
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
    case 2:
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
    case 4:
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
    default:
      return null;
  }
}
