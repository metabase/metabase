import { t } from "ttag";
import { useState, useMemo } from "react";

import { Box, Button, Flex, NumberInput, Text, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/metadata/Metadata";

import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { ColumnValuesWidget } from "../ColumnValuesWidget";
import { Footer } from "../Footer";
import { FlexWithScroll } from "../FilterPicker.styled";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

import { OPERATOR_OPTIONS } from "./constants";
import { findSecondColumn, isFilterValid } from "./utils";
import { CoordinateColumnSelect } from "./CoordinateColumnSelect";

export function CoordinateFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  metadata,
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

  const valueCount = useMemo(() => {
    const option = availableOperators.find(
      option => option.operator === operatorName,
    );
    return option?.valueCount ?? 0;
  }, [availableOperators, operatorName]);

  const isValid = useMemo(
    () => isFilterValid(operatorName, values),
    [operatorName, values],
  );

  const handleOperatorChange = (
    newOperatorName: Lib.CoordinateFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues([]);
    setColumn2(
      findSecondColumn({
        query,
        stageIndex,
        column,
        filter,
        operatorName: newOperatorName,
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
    <>
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        <FilterOperatorPicker
          value={operatorName}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </Header>
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
        metadata={metadata}
        onChange={setValues}
      />
      <Footer mt={valueCount === 0 ? -1 : undefined} /* to collapse borders */>
        <Box />
        <Button
          variant="filled"
          disabled={!isValid}
          onClick={handleFilterChange}
        >
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
  );
}

interface CoordinateValueInputProps {
  values: number[];
  valueCount: number;
  column: Lib.ColumnMetadata;
  metadata: Metadata;
  onChange: (values: number[]) => void;
}

function CoordinateValueInput({
  values,
  onChange,
  valueCount,
  column,
  metadata,
}: CoordinateValueInputProps) {
  const placeholder = t`Enter a number`;

  switch (valueCount) {
    case Infinity:
      return (
        <FlexWithScroll p="md" mah={300}>
          <ColumnValuesWidget
            value={values}
            column={column}
            metadata={metadata}
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
