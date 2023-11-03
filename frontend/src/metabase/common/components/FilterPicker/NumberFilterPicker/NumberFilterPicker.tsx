import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Button, Flex, NumberInput, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { ColumnValuesWidget } from "../ColumnValuesWidget";
import { Footer } from "../Footer";
import { FlexWithScroll } from "../FilterPicker.styled";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { OPERATOR_OPTIONS } from "./constants";
import { isFilterValid } from "./utils";

export function NumberFilterPicker({
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
    ? Lib.numberFilterParts(query, stageIndex, filter)
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

  const { valueCount = 0 } = OPERATOR_OPTIONS[operatorName] ?? {};

  const isValid = useMemo(
    () => isFilterValid(operatorName, values),
    [operatorName, values],
  );

  const handleOperatorChange = (
    nextOperatorName: Lib.NumberFilterOperatorName,
  ) => {
    const nextOption = OPERATOR_OPTIONS[nextOperatorName];
    const nextValues = values.slice(0, nextOption.valueCount);
    setOperatorName(nextOperatorName);
    setValues(nextValues);
  };

  const handleFilterChange = () => {
    onChange(
      Lib.numberFilterClause({
        operator: operatorName,
        column,
        values,
      }),
    );
  };

  return (
    <div data-testid="number-filter-picker">
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        <FilterOperatorPicker
          value={operatorName}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </Header>
      <NumberValueInput
        values={values}
        valueCount={valueCount}
        column={column}
        onChange={setValues}
      />
      <Footer mt={valueCount === 0 ? -1 : undefined} /* to collapse borders */>
        <Box />
        <Button
          variant="filled"
          disabled={!isValid}
          onClick={handleFilterChange}
        >
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Footer>
    </div>
  );
}

interface NumberValueInputProps {
  values: number[];
  valueCount: number;
  column: Lib.ColumnMetadata;
  onChange: (values: number[]) => void;
}

function NumberValueInput({
  values,
  valueCount,
  column,
  onChange,
}: NumberValueInputProps) {
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
    default:
      return null;
  }
}
