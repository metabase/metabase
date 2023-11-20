import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";
import { Flex, Grid, NumberInput, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { ColumnValuesWidget } from "metabase/common/components/ColumnValuesWidget";
import { getColumnIcon } from "metabase/common/utils/columns";
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

  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const columnIcon = getColumnIcon(column);

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
    <Grid grow>
      <Grid.Col span="auto">
        <Flex h="100%" align="center" gap="sm">
          <Icon name={columnIcon} />
          <Text color="text.2" weight="bold">
            {columnInfo.displayName}
          </Text>
          <FilterOperatorPicker
            value={operator}
            options={availableOperators}
            onChange={setOperator}
          />
        </Flex>
      </Grid.Col>
      <Grid.Col span={6}>
        <NumberValueInput
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={setValues}
        />
      </Grid.Col>
    </Grid>
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
  if (hasMultipleValues) {
    return (
      <ColumnValuesWidget
        value={values}
        column={column}
        hasMultipleValues
        onChange={onChange}
      />
    );
  }

  if (valueCount === 1) {
    return (
      <NumberInput
        value={values[0]}
        onChange={newValue => onChange([newValue])}
        placeholder={t`Enter a number`}
      />
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center">
        <NumberInput
          value={values[0]}
          onChange={(newValue: number) => onChange([newValue, values[1]])}
          placeholder={t`Min`}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          onChange={(newValue: number) => onChange([values[0], newValue])}
          placeholder={t`Max`}
        />
      </Flex>
    );
  }

  return null;
}
