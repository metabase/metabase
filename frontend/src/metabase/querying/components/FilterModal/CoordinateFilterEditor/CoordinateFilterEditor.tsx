import { useMemo } from "react";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { Flex, Grid, NumberInput, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useCoordinateFilter } from "metabase/querying/hooks/use-coordinate-filter";
import type { NumberValue } from "metabase/querying/hooks/use-coordinate-filter";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterValuePicker } from "../FilterValuePicker";
import type { FilterEditorProps } from "../types";

export function CoordinateFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: FilterEditorProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  const {
    operator,
    availableOptions,
    secondColumn,
    values,
    valueCount,
    hasMultipleValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useCoordinateFilter({
    query,
    stageIndex,
    column,
    filter,
    defaultOperator: "between",
  });

  const handleOperatorChange = (
    newOperator: Lib.CoordinateFilterOperatorName,
  ) => {
    setOperator(newOperator);
    onChange(getFilterClause(newOperator, secondColumn, values));
  };

  const handleInputChange = (newValues: NumberValue[]) => {
    setValues(newValues);
    onChange(getFilterClause(operator, secondColumn, newValues));
  };

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
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: NumberValueInputProps) {
  if (hasMultipleValues) {
    return (
      <FilterValuePicker value={values} column={column} onChange={onChange} />
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
          onChange={(newValue: number) => onChange([newValue, values[1]])}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberInput
          value={values[1]}
          placeholder={t`Max`}
          onChange={(newValue: number) => onChange([values[0], newValue])}
        />
      </Flex>
    );
  }

  if (valueCount === 4) {
    return (
      <Flex align="center" gap="md">
        <NumberInput
          value={values[2]}
          placeholder={t`Lower latitude`}
          onChange={(newValue: number) =>
            onChange([values[0], values[1], newValue, values[3]])
          }
        />
        <NumberInput
          value={values[0]}
          placeholder={t`Upper latitude`}
          onChange={(newValue: number) =>
            onChange([newValue, values[1], values[2], values[3]])
          }
        />
        <NumberInput
          value={values[1]}
          placeholder={t`Left longitude`}
          onChange={(newValue: number) =>
            onChange([values[0], newValue, values[2], values[3]])
          }
        />
        <NumberInput
          value={values[3]}
          placeholder={t`Right longitude`}
          onChange={(newValue: number) =>
            onChange([values[0], values[1], values[2], newValue])
          }
        />
      </Flex>
    );
  }

  return null;
}
