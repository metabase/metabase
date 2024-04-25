import { useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { useStringFilter } from "metabase/querying/hooks/use-string-filter";
import { Grid, TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { StringFilterValuePicker } from "../../FilterValuePicker";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterTitle, HoverParent } from "../FilterTitle";
import type { FilterEditorProps } from "../types";

export function StringFilterEditor({
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
    availableOptions,
    values,
    valueCount,
    hasMultipleValues,
    options,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useStringFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.StringFilterOperatorName) => {
    const newValues = getDefaultValues(newOperator, values);
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, newValues, options));
  };

  const handleInputChange = (newValues: string[]) => {
    setValues(newValues);
    if (isFocused) {
      onInput();
    } else {
      onChange(getFilterClause(operator, newValues, options));
    }
  };

  const handleInputFocus = () => {
    setIsFocused(true);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    onChange(getFilterClause(operator, values, options));
  };

  return (
    <HoverParent>
      <Grid grow>
        <Grid.Col span="auto">
          <FilterTitle
            query={query}
            stageIndex={stageIndex}
            column={column}
            columnIcon={columnIcon}
            isSearching={isSearching}
          >
            <FilterOperatorPicker
              value={operator}
              options={availableOptions}
              onChange={handleOperatorChange}
            />
          </FilterTitle>
        </Grid.Col>
        <Grid.Col span={4}>
          <StringValueInput
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

interface StringValueInputProps {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: string[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: string[]) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function StringValueInput({
  query,
  stageIndex,
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
  onFocus,
  onBlur,
}: StringValueInputProps) {
  if (hasMultipleValues) {
    return (
      <StringFilterValuePicker
        query={query}
        stageIndex={stageIndex}
        column={column}
        values={values}
        compact
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  if (valueCount === 1) {
    return (
      <TextInput
        value={values[0]}
        placeholder={t`Enter some text`}
        aria-label={t`Filter value`}
        onChange={event => onChange([event.target.value])}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  return null;
}
