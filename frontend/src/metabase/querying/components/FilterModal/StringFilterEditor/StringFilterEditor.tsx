import { useMemo } from "react";
import { t } from "ttag";
import { Flex, Grid, TextInput } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useStringFilter } from "metabase/querying/hooks/use-string-filter";
import type * as Lib from "metabase-lib";
import { FilterColumnName } from "../FilterColumnName";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterValuePicker } from "../FilterValuePicker";
import type { FilterEditorProps } from "../types";

export function StringFilterEditor({
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
    onChange(getFilterClause(operator, newValues, options));
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

interface StringValueInputProps {
  column: Lib.ColumnMetadata;
  values: string[];
  valueCount: number;
  hasMultipleValues?: boolean;
  onChange: (values: string[]) => void;
}

function StringValueInput({
  column,
  values,
  valueCount,
  hasMultipleValues,
  onChange,
}: StringValueInputProps) {
  if (hasMultipleValues) {
    return (
      <FilterValuePicker value={values} column={column} onChange={onChange} />
    );
  }

  if (valueCount === 1) {
    return (
      <TextInput
        value={values[0]}
        placeholder={t`Enter some text`}
        onChange={event => onChange([event.target.value])}
      />
    );
  }

  return null;
}
