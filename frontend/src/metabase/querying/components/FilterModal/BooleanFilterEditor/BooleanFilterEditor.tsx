import { useMemo } from "react";
import { checkNotNull } from "metabase/lib/types";
import { Icon } from "metabase/core/components/Icon";
import { Checkbox, Flex, Grid, Group, Text } from "metabase/ui";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  getAvailableOptions,
  getFilterClause,
  getOptionByType,
  getOptionType,
} from "metabase/querying/utils/boolean-filter";
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
  const columnInfo = useMemo(
    () => Lib.displayInfo(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const options = useMemo(
    () => getAvailableOptions(query, stageIndex, column),
    [query, stageIndex, column],
  );

  const optionType = useMemo(
    () => getOptionType(query, stageIndex, filter),
    [query, stageIndex, filter],
  );

  const visibleOptions = useMemo(
    () => options.filter(option => option.isAdvanced),
    [options],
  );

  const columnIcon = getColumnIcon(column);
  const isAdvanced = getOptionByType(optionType).isAdvanced;

  const handleOptionChange = (type: string) => {
    const option = checkNotNull(options.find(option => option.type === type));
    onChange(getFilterClause(column, option.type));
  };

  return (
    <Grid grow>
      <Grid.Col span="auto">
        <Flex h="100%" align="center" gap="sm">
          <Icon name={columnIcon} />
          <Text color="text.2" weight="bold">
            {columnInfo.displayName}
          </Text>
          {isAdvanced && (
            <FilterOperatorPicker
              value={optionType}
              options={options}
              onChange={handleOptionChange}
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
              onChange={() => handleOptionChange(option.type)}
            />
          ))}
        </Group>
      </Grid.Col>
    </Grid>
  );
}
