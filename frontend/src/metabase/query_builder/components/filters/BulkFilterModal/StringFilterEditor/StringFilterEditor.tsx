import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";
import { Flex, Grid, Text, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useStringFilter } from "metabase/common/hooks/filters/use-string-filter";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { FilterValuesWidget } from "../FilterValuesWidget";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

export function StringFilterEditor({
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
    hasMultipleValues,
    availableOperators,
    setOperator,
    setValues,
    getFilterClause,
  } = useStringFilter({
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
        <StringValueInput
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

interface StringValueInputProps {
  column: Lib.ColumnMetadata;
  values: string[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: string[]) => void;
}

function StringValueInput({
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: StringValueInputProps) {
  if (hasMultipleValues) {
    return (
      <FilterValuesWidget
        column={column}
        value={values}
        hasMultipleValues={hasMultipleValues}
        onChange={onChange}
      />
    );
  }

  if (valueCount === 1) {
    return (
      <TextInput
        value={values[0]}
        onChange={event => onChange([event.target.value])}
        placeholder={t`Enter some text`}
      />
    );
  }

  return null;
}
