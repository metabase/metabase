import { useMemo } from "react";
import { t } from "ttag";
import { Flex, Grid, NumberInput, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useNumberFilter } from "metabase/querying/hooks/use-number-filter";
import type { NumberValue } from "metabase/querying/hooks/use-number-filter";
import * as Lib from "metabase-lib";
import { FilterColumnName } from "../FilterColumnName";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterValuePicker } from "../FilterValuePicker";
import type { FilterEditorProps } from "../types";

export function NumberFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  isSearching,
  onChange,
}: FilterEditorProps) {
  const { columnIcon, isKey } = useMemo(
    () => ({
      columnIcon: getColumnIcon(column),
      isKey: Lib.isPrimaryKey(column) || Lib.isForeignKey(column),
    }),
    [column],
  );

  const {
    operator,
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
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
    setOperator(newOperator);
    onChange(getFilterClause(newOperator, values));
  };

  const handleInputChange = (newValues: NumberValue[]) => {
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
        <NumberValueInput
          column={column}
          values={values}
          valueCount={valueCount}
          hasMultipleValues={hasMultipleValues}
          onChange={handleInputChange}
        />
      </Grid.Col>
    </Grid>
  );
}

interface NumberValueInputProps {
  column: Lib.ColumnMetadata;
  values: NumberValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberValue[]) => void;
}

function NumberValueInput({
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  if (hasMultipleValues) {
    return (
      <FilterValuePicker
        values={values.map(value => String(value))}
        placeholder={t`Enter a number`}
        getCreateLabel={query => (isFinite(parseFloat(query)) ? query : null)}
        onChange={values => onChange(values.map(value => Number(value)))}
      />
    );
  }

  if (valueCount === 1) {
    return (
      <NumberInput
        value={values[0]}
        placeholder={t`Enter a number`}
        onChange={newValue => onChange([newValue])}
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
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          placeholder={t`Max`}
          maw="8rem"
          onChange={(newValue: number) => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  return null;
}
