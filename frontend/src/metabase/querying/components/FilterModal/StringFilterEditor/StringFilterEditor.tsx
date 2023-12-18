import { useMemo, useState } from "react";
import { t } from "ttag";
import { Flex, Grid, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useStringFilter } from "metabase/querying/hooks/use-string-filter";
import type * as Lib from "metabase-lib";
import { StringFilterValuePicker } from "../../FilterValuePicker";
import { FilterColumnName } from "../FilterColumnName";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
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
    setOperator(newOperator);
    onChange(getFilterClause(newOperator, values, options));
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
        isCompact
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
        onChange={event => onChange([event.target.value])}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  return null;
}
