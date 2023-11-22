import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";
import { Flex, Grid, Text, TimeInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useTimeFilter } from "metabase/common/hooks/filters/use-time-filter";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

export function TimeFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const columnIcon = getColumnIcon(column);

  const {
    operator,
    values,
    valueCount,
    availableOperators,
    setOperator,
    setValues,
    getFilterClause,
  } = useTimeFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const previousOperator = usePrevious(operator);
  const previousValues = usePrevious(values);

  useEffect(() => {
    if (operator !== previousOperator || !_.isEqual(values, previousValues)) {
      onChange(getFilterClause());
    }
  }, [
    operator,
    values,
    previousOperator,
    previousValues,
    onChange,
    getFilterClause,
  ]);

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
      <Grid.Col span={4}>
        <TimeValueInput
          values={values}
          valueCount={valueCount}
          onChange={setValues}
        />
      </Grid.Col>
    </Grid>
  );
}

interface TimeValueInputProps {
  values: Date[];
  valueCount: number;
  onChange: (values: Date[]) => void;
}

function TimeValueInput({ values, valueCount, onChange }: TimeValueInputProps) {
  if (valueCount === 1) {
    const [value] = values;
    return (
      <TimeInput value={value} onChange={newValue => onChange([newValue])} />
    );
  }

  if (valueCount === 2) {
    const [value1, value2] = values;
    return (
      <Flex align="center">
        <TimeInput
          value={value1}
          onChange={newValue1 => onChange([newValue1, value2])}
        />
        <Text mx="sm">{t`and`}</Text>
        <TimeInput
          value={value2}
          onChange={newValue2 => onChange([value1, newValue2])}
        />
      </Flex>
    );
  }

  return null;
}
