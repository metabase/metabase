import { useMemo } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Checkbox, Flex, Grid, Group, Text } from "metabase/ui";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useBooleanOperatorFilter } from "metabase/querying/hooks/use-boolean-operator-filter";
import * as Lib from "metabase-lib";
import { FilterOperatorPicker } from "../FilterOperatorPicker";
import type { FilterPickerWidgetProps } from "../types";

export function BooleanFilterEditor({
  query,
  stageIndex,
  column,
  filter,
  onChange,
}: FilterPickerWidgetProps) {
  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  const {
    operator,
    availableOperators,
    values,
    isExpanded,
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
    setOperator(newOperator);
    onChange(getFilterClause(newOperator, values));
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
          <Text color="text.2" weight="bold">
            {columnInfo.displayName}
          </Text>
          {isExpanded && (
            <FilterOperatorPicker
              value={operator}
              options={availableOperators}
              onChange={handleOperatorChange}
            />
          )}
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        <Group spacing="md">
          <Checkbox
            label={t`True`}
            checked={values[0] ?? false}
            indeterminate={values[0] == null}
            onChange={event =>
              handleValuesChange(event.target.checked ? [true] : [])
            }
          />
          <Checkbox
            label={t`False`}
            checked={values[0] ?? false}
            indeterminate={values[0] == null}
            onChange={event =>
              handleValuesChange(event.target.checked ? [false] : [])
            }
          />
        </Group>
      </Grid.Col>
    </Grid>
  );
}
