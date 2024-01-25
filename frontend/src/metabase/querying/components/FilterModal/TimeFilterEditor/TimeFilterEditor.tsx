import { useMemo, useState } from "react";
import { t } from "ttag";
import { Flex, Grid, Text, TimeInput, Icon } from "metabase/ui";

import { getColumnIcon } from "metabase/common/utils/columns";
import { useTimeFilter } from "metabase/querying/hooks/use-time-filter";
import type { TimeValue } from "metabase/querying/hooks/use-time-filter";
import type * as Lib from "metabase-lib";
import { FilterColumnName } from "../FilterColumnName";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import type { FilterEditorProps } from "../types";

export function TimeFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  isSearching,
  onChange,
  onInput,
}: FilterEditorProps) {
  const columnIcon = useMemo(() => getColumnIcon(column), [column]);
  const [isFocused, setIsFocused] = useState(false);

  const {
    operator,
    values,
    valueCount,
    availableOptions,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useTimeFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.TimeFilterOperatorName) => {
    const newValues = getDefaultValues(newOperator, values);
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, newValues));
  };

  const handleInputChange = (newValues: TimeValue[]) => {
    setValues(newValues);
    if (isFocused) {
      onInput();
    } else {
      onChange(getFilterClause(operator, newValues));
    }
  };

  const handleInputFocus = () => {
    setIsFocused(true);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    onChange(getFilterClause(operator, values));
  };

  return (
    <Grid grow>
      <Grid.Col span="auto">
        <Flex h="100%" align="center" gap="sm">
          <Icon name={columnIcon} />
          <FilterColumnName
            query={query}
            stageIndex={stageIndex}
            column={column}
            isSearching={isSearching}
          />
          <FilterOperatorPicker
            value={operator}
            options={availableOptions}
            onChange={handleOperatorChange}
          />
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        <TimeValueInput
          values={values}
          valueCount={valueCount}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
      </Grid.Col>
    </Grid>
  );
}

interface TimeValueInputProps {
  values: TimeValue[];
  valueCount: number;
  onChange: (values: TimeValue[]) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function TimeValueInput({
  values,
  valueCount,
  onChange,
  onFocus,
  onBlur,
}: TimeValueInputProps) {
  if (valueCount === 1) {
    const [value] = values;
    return (
      <TimeInput
        value={value}
        placeholder={t`Enter a time`}
        aria-label={t`Filter value`}
        clearable
        onChange={newValue => onChange([newValue])}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  if (valueCount === 2) {
    const [value1, value2] = values;
    return (
      <Flex align="center">
        <TimeInput
          value={value1}
          placeholder={t`Min`}
          clearable
          onChange={newValue1 => onChange([newValue1, value2])}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <Text mx="sm">{t`and`}</Text>
        <TimeInput
          value={value2}
          placeholder={t`Max`}
          clearable
          onChange={newValue2 => onChange([value1, newValue2])}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Flex>
    );
  }

  return null;
}
