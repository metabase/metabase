import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";
import { Flex, NumberInput, Text } from "metabase/ui";
import { ColumnValuesWidget } from "metabase/common/components/ColumnValuesWidget";
import { useNumberFilter } from "metabase/common/hooks/filters/use-number-filter";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

export function NumberFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: FilterPickerWidgetProps) {
  const isID = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
  const defaultOperator = isID ? "=" : "between";

  const {
    operator,
    values,
    valueCount,
    hasMultipleValues,
    availableOperators,
    setOperator,
    setValues,
    getFilterClause,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
    defaultOperator,
  });

  const previousOperator = usePrevious(operator);
  const previousValues = usePrevious(values);

  useEffect(() => {
    if (operator !== previousOperator || !_.isEqual(values, previousValues)) {
      onChange(getFilterClause());
    }
  });

  return (
    <Flex align="center">
      <FilterOperatorPicker
        value={operator}
        options={availableOperators}
        onChange={setOperator}
      />
      <NumberValueInput
        column={column}
        values={values}
        valueCount={valueCount}
        hasMultipleValues={hasMultipleValues}
        onChange={setValues}
      />
    </Flex>
  );
}

type NumberValue = number | "";

interface NumberValueInputProps {
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
}

function NumberValueInput({
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  const placeholder = t`Enter a number`;

  if (hasMultipleValues) {
    return (
      <Flex p="md">
        <ColumnValuesWidget
          value={values}
          column={column}
          hasMultipleValues
          onChange={onChange}
        />
      </Flex>
    );
  }

  if (valueCount === 1) {
    return (
      <Flex p="md">
        <NumberInput
          value={values[0]}
          onChange={newValue => onChange([newValue])}
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

  return null;
}
