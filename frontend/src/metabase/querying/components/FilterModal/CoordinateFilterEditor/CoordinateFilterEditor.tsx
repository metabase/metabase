import { useMemo } from "react";
import { t } from "ttag";
import type * as Lib from "metabase-lib";
import { Flex, Grid, NumberInput, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useCoordinateFilter } from "metabase/querying/hooks/use-coordinate-filter";
import type { NumberValue } from "metabase/querying/hooks/use-coordinate-filter";
import { FilterColumnName } from "../FilterColumnName";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterValuePicker } from "../FilterValuePicker";
import type { FilterEditorProps } from "../types";

export function CoordinateFilterEditor({
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
        getCreateLabel={query => (isFinite(Number(query)) ? query : null)}
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
