import { useMemo } from "react";
import { t } from "ttag";
import { Flex, Grid, NumberInput, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useNumberFilter } from "metabase/querying/hooks/use-number-filter";
import { FilterValuesWidget } from "metabase/querying/components/FilterPicker/FilterValuesWidget";
import * as Lib from "metabase-lib";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import type { FilterPickerWidgetProps } from "../types";

export function NumberFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const { columnIcon, isKey } = useMemo(() => {
    const columnIcon = getColumnIcon(column);
    const isKey = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
    return { columnIcon, isKey };
  }, [column]);

  const {
    operator,
    availableOperators,
    values,
    valueCount,
    hasMultipleValues,
    handleOperatorChange,
    handleValuesChange,
  } = useNumberFilter({
    query,
    stageIndex,
    column,
    filter,
    defaultOperator: isKey ? "=" : "between",
    onChange,
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
          onChange={handleValuesChange}
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
      <FilterValuesWidget
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
