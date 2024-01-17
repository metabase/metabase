import { useMemo } from "react";
import { t } from "ttag";
import { Icon, Checkbox, Flex, Grid, Group } from "metabase/ui";

import { getColumnIcon } from "metabase/common/utils/columns";
import { useBooleanOperatorFilter } from "metabase/querying/hooks/use-boolean-operator-filter";
import type * as Lib from "metabase-lib";
import { FilterColumnName } from "../FilterColumnName";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import type { FilterEditorProps } from "../types";

export function BooleanFilterEditor({
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
    isExpanded,
    getDefaultValues,
    getFilterClause,
    setOperator,
    setValues,
  } = useBooleanOperatorFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const handleOperatorChange = (newOperator: Lib.BooleanFilterOperatorName) => {
    const newValues = getDefaultValues();
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, newValues));
  };

  const handleValuesChange = (newValues: boolean[]) => {
    const newOperator = "=";
    setOperator(newOperator);
    setValues(newValues);
    onChange(getFilterClause(newOperator, newValues));
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
          {isExpanded && (
            <FilterOperatorPicker
              value={operator}
              options={availableOptions}
              onChange={handleOperatorChange}
            />
          )}
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        <Group spacing="md">
          <Checkbox
            label={t`True`}
            checked={values.length > 0 ? values[0] : false}
            indeterminate={valueCount === 0}
            onChange={event =>
              handleValuesChange(event.target.checked ? [true] : [])
            }
          />
          <Checkbox
            label={t`False`}
            checked={values.length > 0 ? !values[0] : false}
            indeterminate={valueCount === 0}
            onChange={event =>
              handleValuesChange(event.target.checked ? [false] : [])
            }
          />
        </Group>
      </Grid.Col>
    </Grid>
  );
}
