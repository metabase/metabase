import { useMemo } from "react";
import { Icon } from "metabase/core/components/Icon";
import { Checkbox, Flex, Grid, Group, Text } from "metabase/ui";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useBooleanFilter } from "metabase/querying/hooks/use-boolean-filter";
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
  const columnIcon = useMemo(() => {
    return getColumnIcon(column);
  }, [column]);

  const columnInfo = useMemo(() => {
    return Lib.displayInfo(query, stageIndex, column);
  }, [query, stageIndex, column]);

  const {
    options,
    optionType,
    isAdvanced,
    isExpanded,
    handleOptionTypeChange,
  } = useBooleanFilter({
    query,
    stageIndex,
    column,
    filter,
    onChange,
  });

  const visibleOptions = useMemo(
    () => options.filter(option => !option.isAdvanced),
    [options],
  );

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
              value={optionType}
              options={options}
              onChange={handleOptionTypeChange}
            />
          )}
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        <Group spacing="md">
          {visibleOptions.map(option => (
            <Checkbox
              key={option.type}
              value={option.type}
              label={option.name}
              checked={option.type === optionType}
              indeterminate={isAdvanced}
              onChange={() => handleOptionTypeChange(option.type)}
            />
          ))}
        </Group>
      </Grid.Col>
    </Grid>
  );
}
