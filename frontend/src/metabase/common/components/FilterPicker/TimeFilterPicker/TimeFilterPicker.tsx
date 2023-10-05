import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Text } from "metabase/ui";
import { TimeInput } from "metabase/common/components/TimeInput";

import * as Lib from "metabase-lib";

import type { FilterPickerWidgetProps } from "../types";
import { BackButton } from "../BackButton";
import { Header } from "../Header";
import { Footer } from "../Footer";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

export const defaultTimeValue = {
  hour: 0,
  minute: 0,
};

export const timeFilterValueCountMap = {
  "is-null": 0,
  "not-null": 0,
  ">": 1,
  "<": 1,
  between: 2,
};

export const supportedOperators = [
  "<",
  ">",
  "between",
  "is-null",
  "not-null",
] as const;

function getDefaultValuesForOperator(
  operatorName: Lib.TimeFilterOperatorName,
): Lib.TimeParts[] {
  const valueCount = timeFilterValueCountMap[operatorName];
  return Array(valueCount).fill(defaultTimeValue);
}

export function TimeFilterPicker({
  query,
  stageIndex,
  column,
  filter,
  onBack,
  onChange,
}: FilterPickerWidgetProps) {
  const columnName = Lib.displayInfo(query, stageIndex, column).longDisplayName;

  const filterParts = filter
    ? Lib.timeFilterParts(query, stageIndex, filter)
    : null;

  const [operatorName, setOperatorName] = useState<Lib.TimeFilterOperatorName>(
    filterParts ? filterParts.operator : "<",
  );

  const [values, setValues] = useState<Lib.TimeParts[]>(
    filterParts?.values ?? getDefaultValuesForOperator(operatorName),
  );

  const valueCount = timeFilterValueCountMap[operatorName];
  const hasValuesInput = valueCount > 0;
  const isValid = values.length === valueCount;

  const handleOperatorChange = (
    newOperatorName: Lib.TimeFilterOperatorName,
  ) => {
    setOperatorName(newOperatorName);
    setValues(getDefaultValuesForOperator(newOperatorName));
  };

  const handleFilterChange = () => {
    if (isValid) {
      onChange(
        Lib.timeFilterClause({
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
          query={query}
          stageIndex={stageIndex}
          column={column}
          value={operatorName}
          supportedOperators={supportedOperators}
          onChange={newOperatorName =>
            handleOperatorChange(newOperatorName as Lib.TimeFilterOperatorName)
          }
        />
      </Header>
      {hasValuesInput && (
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
        <Button disabled={!isValid} onClick={handleFilterChange}>
          {filter ? t`Update filter` : t`Add filter`}
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
  values: Lib.TimeParts[];
  valueCount: number;
  onChange: (values: Lib.TimeParts[]) => void;
}) {
  if (valueCount === 1) {
    const [value = defaultTimeValue] = values;
    return <TimeInput value={value} onChange={value => onChange([value])} />;
  }

  if (valueCount === 2) {
    const [value1 = defaultTimeValue, value2 = defaultTimeValue] = values;
    return (
      <Flex direction="column" gap="sm">
        <TimeInput
          value={value1}
          onChange={newValue1 => onChange([newValue1, value2])}
        />
        <Text>{t`and`}</Text>
        <TimeInput
          value={value2}
          onChange={newValue2 => onChange([value1, newValue2])}
        />
      </Flex>
    );
  }

  return null;
}
