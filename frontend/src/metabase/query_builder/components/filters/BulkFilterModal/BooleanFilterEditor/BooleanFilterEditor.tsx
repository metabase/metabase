import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import _ from "underscore";
import { Checkbox, Flex, Grid, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { getColumnIcon } from "metabase/common/utils/columns";
import {
  useBooleanFilter,
  type OptionType,
} from "metabase/common/hooks/filters/use-boolean-filter";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { FilterOperatorPicker } from "../FilterOperatorPicker";

function isAdvancedOptionType(optionType: OptionType) {
  return optionType === "is-null" || optionType === "not-null";
}

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

  const columnIcon = getColumnIcon(column);

  const { value, options, setOption, getFilterClause } = useBooleanFilter({
    query,
    stageIndex,
    column,
    filter,
  });

  const visibleOptions = useMemo(
    () => options.filter(option => !isAdvancedOptionType(option.type)),
    [options],
  );

  const isAdvancedOption = isAdvancedOptionType(value);
  const previousValue = usePrevious(value);

  useEffect(() => {
    if (value !== previousValue) {
      onChange(getFilterClause());
    }
  });

  return (
    <Grid grow>
      <Grid.Col span="auto">
        <Flex h="100%" align="center" gap="sm">
          <Icon name={columnIcon} />
          <Text color="text.2" weight="bold">
            {columnInfo.displayName}
          </Text>
          {isAdvancedOption && (
            <FilterOperatorPicker
              value={value}
              options={options}
              disabled
              onChange={_.noop}
            />
          )}
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        <Checkbox.Group
          value={[value]}
          onChange={values => setOption(values[1])}
          display="flex"
        >
          {visibleOptions.map(option => (
            <Checkbox
              key={option.type}
              value={option.type}
              label={option.name}
              indeterminate={isAdvancedOption}
              mr="1rem"
            />
          ))}
        </Checkbox.Group>
      </Grid.Col>
    </Grid>
  );
}
