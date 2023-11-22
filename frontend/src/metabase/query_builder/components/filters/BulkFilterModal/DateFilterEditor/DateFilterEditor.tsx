import { useMemo } from "react";
import { Button, Flex, Grid, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { DatePickerValue } from "metabase/common/components/DatePicker";
import { getShortcutOptionGroups } from "metabase/common/components/DatePicker";
import { getColumnIcon } from "metabase/common/utils/columns";
import { useDateFilter } from "metabase/common/hooks/filters/use-date-filter";
import * as Lib from "metabase-lib";
import type { FilterPickerWidgetProps } from "../types";
import { CustomFilterPopover } from "./CustomFilterPopover";
import { DatePickerPopover } from "./DatePickerPopover";

const MAIN_SHORTCUTS = getShortcutOptionGroups([
  "today",
  "yesterday",
  "last-week",
  "last-month",
]).flat();

export function DateFilterEditor({
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

  const { value, availableOperators, availableUnits, getFilterClause } =
    useDateFilter({
      query,
      stageIndex,
      column,
      filter,
    });

  const selectedMainShortcut = useMemo(() => {
    // All shortcuts are relative time filters
    if (!value || value.type !== "relative") {
      return;
    }

    const selectedOption = MAIN_SHORTCUTS.find(option => {
      return (
        option.value.unit === value.unit && option.value.value === value.value
      );
    });

    return selectedOption?.shortcut;
  }, [value]);

  const hasCustomFilter = filter && !selectedMainShortcut;

  const handleChange = (value: DatePickerValue) => {
    onChange(getFilterClause(value));
  };

  const handleClear = () => {
    onChange(undefined);
  };

  return (
    <Grid grow>
      <Grid.Col span="auto">
        <Flex h="100%" align="center" gap="sm">
          <Icon name={columnIcon} />
          <Text color="text.2" weight="bold">
            {columnInfo.displayName}
          </Text>
        </Flex>
      </Grid.Col>
      <Grid.Col span={4}>
        {hasCustomFilter ? (
          <CustomFilterPopover
            value={value}
            filterInfo={Lib.displayInfo(query, stageIndex, filter)}
            availableOperators={availableOperators}
            availableUnits={availableUnits}
            onChange={handleChange}
            onClear={handleClear}
          />
        ) : (
          <Flex gap="0.5rem">
            {MAIN_SHORTCUTS.map(option => {
              const isSelected = option.shortcut === selectedMainShortcut;
              return (
                <Button
                  key={option.shortcut}
                  variant={isSelected ? "outline" : "default"}
                  aria-selected={isSelected}
                  onClick={() => handleChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
            <DatePickerPopover
              value={value}
              availableOperators={availableOperators}
              availableUnits={availableUnits}
              onChange={handleChange}
            />
          </Flex>
        )}
      </Grid.Col>
    </Grid>
  );
}
