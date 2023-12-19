import { useMemo, useState } from "react";
import { t } from "ttag";
import { isNumber } from "metabase/lib/types";
import { Flex, Grid, NumberInput, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useNumberFilter } from "metabase/querying/hooks/use-number-filter";
import type { NumberValue } from "metabase/querying/hooks/use-number-filter";
import * as Lib from "metabase-lib";
import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { FilterColumnName } from "../FilterColumnName";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import type { FilterEditorProps } from "../types";

export function NumberFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  isSearching,
  onChange,
  onInput,
}: FilterEditorProps) {
  const { columnIcon, isKey } = useMemo(
    () => ({
      columnIcon: getColumnIcon(column),
      isKey: Lib.isPrimaryKey(column) || Lib.isForeignKey(column),
    }),
    [column],
  );
  const [isFocused, setIsFocused] = useState(false);

  const {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
    defaultOperator: isKey ? "=" : "between",
  });

  const handleOperatorChange = (newOperator: Lib.NumberFilterOperatorName) => {
    const newValues = getDefaultValues(newOperator, values);
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, newValues));
  };

  const handleInputChange = (newValues: NumberValue[]) => {
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
        <NumberValueInput
          query={query}
          stageIndex={stageIndex}
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
        />
      </Grid.Col>
    </Grid>
  );
}

interface NumberValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function NumberValueInput({
  query,
  stageIndex,
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
  onFocus,
  onBlur,
}: NumberValueInputProps) {
  if (hasMultipleValues) {
    return (
      <NumberFilterValuePicker
        query={query}
        stageIndex={stageIndex}
        column={column}
        values={values.filter(isNumber)}
        compact
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  if (valueCount === 1) {
    return (
      <NumberInput
        value={values[0]}
        placeholder={t`Enter a number`}
        aria-label={t`Filter value`}
        onChange={newValue => onChange([newValue])}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  if (valueCount === 2) {
    return (
      <Flex align="center">
        <NumberInput
          value={values[0]}
          placeholder={t`Min`}
          maw="8rem"
          onChange={(newValue: number) => onChange([newValue, values[1]])}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          placeholder={t`Max`}
          maw="8rem"
          onChange={(newValue: number) => onChange([values[0], newValue])}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Flex>
    );
  }

  return null;
}
