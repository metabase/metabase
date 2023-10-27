import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Text, TimeInput } from "metabase/ui";

import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";
import { getAvailableOperatorOptions } from "../utils";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { Footer } from "../Footer";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

import { OPERATOR_OPTIONS, OPERATOR_OPTIONS_MAP } from "./constants";
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

  const { valueCount = 0 } = OPERATOR_OPTIONS_MAP[operatorName] ?? {};

  const isValid = useMemo(
    () => isFilterValid(operatorName, values),
    [operatorName, values],
  );

  const handleOperatorChange = (
    nextOperatorName: Lib.TimeFilterOperatorName,
  ) => {
    const nextOption = OPERATOR_OPTIONS_MAP[nextOperatorName];
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
    <>
      <Header>
        <BackButton onClick={onBack}>{columnName}</BackButton>
        <FilterOperatorPicker
          value={operatorName}
          options={availableOperators}
          onChange={handleOperatorChange}
        />
      </Header>
      {valueCount > 0 && (
        <Flex p="md">
          <ValuesInput
            values={values}
            valueCount={valueCount}
            onChange={setValues}
          />
        </Flex>
      )}
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
    </>
  );
}

function ValuesInput({
  values,
  valueCount,
  onChange,
}: {
  values: Date[];
  valueCount: number;
  onChange: (values: Date[]) => void;
}) {
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
