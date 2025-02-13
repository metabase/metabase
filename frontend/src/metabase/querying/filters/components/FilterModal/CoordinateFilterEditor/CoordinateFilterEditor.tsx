import { useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { isNotNull } from "metabase/lib/types";
import {
  type NumberOrEmptyValue,
  useCoordinateFilter,
} from "metabase/querying/filters/hooks/use-coordinate-filter";
import { Flex, Grid, Text } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { NumberFilterValuePicker } from "../../FilterValuePicker";
import { NumberFilterInput } from "../../NumberFilterInput";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterTitle, HoverParent } from "../FilterTitle";
import { useFilterModalContext } from "../context";
import type { FilterEditorProps } from "../types";

export function CoordinateFilterEditor({
  stageIndex,
  column,
  filter,
  onChange,
}: FilterEditorProps) {
  const { query, onInput } = useFilterModalContext();
  const columnIcon = useMemo(() => getColumnIcon(column), [column]);
  const [isFocused, setIsFocused] = useState(false);

  const {
    operator,
    availableOptions,
    secondColumn,
    values,
    valueCount,
    hasMultipleValues,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useCoordinateFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.CoordinateFilterOperator) => {
    const newValues = getDefaultValues(newOperator, values);
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, secondColumn, newValues));
  };

  const handleInputChange = (newValues: NumberOrEmptyValue[]) => {
    setValues(newValues);
    if (isFocused) {
      onInput();
    } else {
      onChange(getFilterClause(operator, secondColumn, newValues));
    }
  };

  const handleInputFocus = () => {
    setIsFocused(true);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    onChange(getFilterClause(operator, secondColumn, values));
  };

  return (
    <HoverParent data-testid="coordinate-filter-editor">
      <Grid grow>
        <Grid.Col span="auto">
          <FilterTitle
            stageIndex={stageIndex}
            column={column}
            columnIcon={columnIcon}
          >
            <FilterOperatorPicker
              value={operator}
              options={availableOptions}
              onChange={handleOperatorChange}
            />
          </FilterTitle>
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
    </HoverParent>
  );
}

interface NumberValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberOrEmptyValue[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: NumberOrEmptyValue[]) => void;
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
        values={values.filter(isNotNull)}
        compact
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  if (valueCount === 1) {
    return (
      <NumberFilterInput
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
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Min`}
          maw="8rem"
          onChange={newValue => onChange([newValue, values[1]])}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <Text mx="sm">{t`and`}</Text>
        <NumberFilterInput
          value={values[1]}
          placeholder={t`Max`}
          maw="8rem"
          onChange={newValue => onChange([values[0], newValue])}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Flex>
    );
  }

  if (valueCount === 4) {
    return (
      <Flex align="center" gap="md">
        <NumberFilterInput
          value={values[2]}
          placeholder={t`Lower latitude`}
          onChange={newValue =>
            onChange([values[0], values[1], newValue, values[3]])
          }
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <NumberFilterInput
          value={values[0]}
          placeholder={t`Upper latitude`}
          onChange={newValue =>
            onChange([newValue, values[1], values[2], values[3]])
          }
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <NumberFilterInput
          value={values[1]}
          placeholder={t`Left longitude`}
          onChange={newValue =>
            onChange([values[0], newValue, values[2], values[3]])
          }
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <NumberFilterInput
          value={values[3]}
          placeholder={t`Right longitude`}
          onChange={newValue =>
            onChange([values[0], values[1], values[2], newValue])
          }
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </Flex>
    );
  }

  return null;
}
