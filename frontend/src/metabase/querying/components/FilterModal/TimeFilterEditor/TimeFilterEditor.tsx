import { useMemo } from "react";
import { t } from "ttag";
import { Flex, Grid, Text, TimeInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
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
}: FilterEditorProps) {
  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  const {
    operator,
    values,
    valueCount,
    availableOptions,
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
    setOperator(newOperator);
    onChange(getFilterClause(newOperator, values));
  };

  const handleInputChange = (newValues: TimeValue[]) => {
    setValues(newValues);
    onChange(getFilterClause(operator, newValues));
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
        />
      </Grid.Col>
    </Grid>
  );
}

interface TimeValueInputProps {
  values: TimeValue[];
  valueCount: number;
  onChange: (values: TimeValue[]) => void;
}

function TimeValueInput({ values, valueCount, onChange }: TimeValueInputProps) {
  if (valueCount === 1) {
    const [value] = values;
    return (
      <TimeInput
        value={value}
        clearable
        onChange={newValue => onChange([newValue])}
      />
    );
  }

  if (valueCount === 2) {
    const [value1, value2] = values;
    return (
      <Flex align="center">
        <TimeInput
          value={value1}
          clearable
          onChange={newValue1 => onChange([newValue1, value2])}
        />
        <Text mx="sm">{t`and`}</Text>
        <TimeInput
          value={value2}
          clearable
          onChange={newValue2 => onChange([value1, newValue2])}
        />
      </Flex>
    );
  }

  return null;
}
