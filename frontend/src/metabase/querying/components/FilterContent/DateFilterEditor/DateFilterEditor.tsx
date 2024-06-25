import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerValue,
  ShortcutOption,
} from "metabase/querying/components/DatePicker";
import { DatePicker } from "metabase/querying/components/DatePicker";
import { useDateFilter } from "metabase/querying/hooks/use-date-filter";
import { Button, Flex, Grid, Popover, Icon } from "metabase/ui";

import { FilterTitle, HoverParent } from "../FilterTitle";
import type { FilterEditorProps } from "../types";

import { ClearIcon } from "./DateFilterEditor.styled";
import { SECONDARY_SHORTCUTS } from "./constants";
import { getFilterName, getSelectedOption, getVisibleOptions } from "./utils";

export function DateFilterEditor({
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

  const { value, availableOperators, availableUnits, getFilterClause } =
    useDateFilter({
      query,
      stageIndex,
      column,
      filter,
    });

  const filterName = getFilterName(query, stageIndex, filter);
  const visibleOptions = getVisibleOptions(value);
  const selectedOption = getSelectedOption(value);

  const handleChange = (value: DatePickerValue | undefined) => {
    onChange(value ? getFilterClause(value) : undefined);
  };

  const handleOptionToggle = (option: ShortcutOption) => {
    if (option.shortcut !== selectedOption?.shortcut) {
      handleChange(option.value);
    } else {
      handleChange(undefined);
    }
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
          />
        </Grid.Col>
        <Grid.Col span={4}>
          <Flex gap="0.5rem">
            {visibleOptions.map(option => {
              const isSelected = option.shortcut === selectedOption?.shortcut;
              return (
                <Button
                  key={option.shortcut}
                  variant={isSelected ? "outline" : "default"}
                  aria-selected={isSelected}
                  onClick={() => handleOptionToggle(option)}
                >
                  {option.label}
                </Button>
              );
            })}
            <DateFilterPopover
              title={filterName}
              value={value}
              availableOperators={availableOperators}
              availableUnits={availableUnits}
              isExpanded={visibleOptions.length === 0}
              onChange={handleChange}
            />
          </Flex>
        </Grid.Col>
      </Grid>
    </HoverParent>
  );
}

interface DateFilterPopoverProps {
  title: string | undefined;
  value: DatePickerValue | undefined;
  availableOperators: ReadonlyArray<DatePickerOperator>;
  availableUnits: ReadonlyArray<DatePickerExtractionUnit>;
  isExpanded: boolean;
  onChange: (value: DatePickerValue | undefined) => void;
}

function DateFilterPopover({
  title,
  value,
  availableOperators,
  availableUnits,
  isExpanded,
  onChange,
}: DateFilterPopoverProps) {
  const [isOpened, setIsOpened] = useState(false);
  const handleOpen = () => setIsOpened(true);
  const handleClose = () => setIsOpened(false);

  const handleChange = (value: DatePickerValue) => {
    onChange(value);
    handleClose();
  };

  const handleClear = (event: MouseEvent) => {
    event.stopPropagation();
    onChange(undefined);
    handleClose();
  };

  return (
    <Popover opened={isOpened} onClose={handleClose}>
      <Popover.Target>
        {isExpanded ? (
          <Button
            variant="outline"
            rightIcon={
              <IconButtonWrapper aria-label={t`Clear`} onClick={handleClear}>
                <ClearIcon name="close" size={12} />
              </IconButtonWrapper>
            }
            onClick={handleOpen}
          >
            {title}
          </Button>
        ) : (
          <Button
            leftIcon={<Icon name="ellipsis" />}
            aria-label={t`More options`}
            onClick={handleOpen}
          />
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <DatePicker
          value={value}
          availableOperators={availableOperators}
          availableShortcuts={isExpanded ? undefined : SECONDARY_SHORTCUTS}
          availableUnits={availableUnits}
          canUseRelativeOffsets
          onChange={handleChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
