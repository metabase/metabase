import { useMemo } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { useBooleanOperatorFilter } from "metabase/querying/hooks/use-boolean-operator-filter";
import { Checkbox, Grid, Group } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { FilterOperatorPicker } from "../FilterOperatorPicker";
import { FilterTitle, HoverParent } from "../FilterTitle";
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
            {isExpanded && (
              <FilterOperatorPicker
                value={operator}
                options={availableOptions}
                onChange={handleOperatorChange}
              />
            )}
          </FilterTitle>
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
    </HoverParent>
  );
}
