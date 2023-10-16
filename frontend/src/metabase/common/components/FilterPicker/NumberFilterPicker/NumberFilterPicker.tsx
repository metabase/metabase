import { t } from "ttag";
import { useState, useMemo } from "react";
import { Box, Button, Flex, NumberInput, Text } from "metabase/ui";
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
import { isFilterValid } from "./utils";

export function NumberFilterPicker({
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
    newOperatorName: Lib.NumberFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues([]);
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
    <>
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
        metadata={metadata}
        onChange={setValues}
      />
      <Footer mt={valueCount === 0 ? -1 : undefined} /* to collapse borders */>
        <Box />
        <Button disabled={!isValid} onClick={handleFilterChange}>
          {filter ? t`Update filter` : t`Add filter`}
        </Button>
      </Footer>
    </>
  );
}

interface NumberValueInputProps {
  values: number[];
  valueCount: number;
  column: Lib.ColumnMetadata;
  metadata: Metadata;
  onChange: (values: number[]) => void;
}

function NumberValueInput({
  values,
  valueCount,
  column,
  metadata,
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
    default:
      return null;
  }
}
