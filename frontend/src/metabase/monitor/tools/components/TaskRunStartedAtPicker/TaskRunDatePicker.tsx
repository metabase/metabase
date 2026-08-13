import type { MouseEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  Combobox,
  Group,
  Input,
  Popover,
  Select,
  Stack,
  Switch,
} from "metabase/ui";
import type { TaskRunDateFilterOption } from "metabase-types/api";

import { guardTaskRunStartedAtRange } from "../../utils";

type TaskRunDatePickerProps = {
  value: TaskRunDateFilterOption | null;
  includeToday: boolean;
  placeholder?: string;
  onChange: (
    value: TaskRunDateFilterOption | null,
    includeToday: boolean,
  ) => void;
};

type DateOption = {
  label: string;
  value: TaskRunDateFilterOption;
};

const PICKER_WIDTH = 260;
const RIGHT_SECTION_FULL_WIDTH = 52;

/**
 * TODO: this whole component (Select + Switch in a popover with a Select-like trigger) should be generalized.
 */
export const TaskRunDatePicker = ({
  value,
  includeToday,
  placeholder,
  onChange,
}: TaskRunDatePickerProps) => {
  const isIncludeTodayAllowed = (value: TaskRunDateFilterOption | null) =>
    value !== null && value !== "thisday";

  const emit = (
    next: TaskRunDateFilterOption | null,
    nextIncludeToday: boolean,
  ) => onChange(next, isIncludeTodayAllowed(next) && nextIncludeToday);

  const [opened, setOpened] = useState<boolean>(false);
  /**
   * Using a simple version of TimeFilterWidget here in order to align with a design of admin page.
   * That means no custom date ranges.
   */
  const options: DateOption[] = [
    { label: t`Today`, value: "thisday" },
    { label: t`Yesterday`, value: "past1days" },
    { label: t`Previous week`, value: "past1weeks" },
    { label: t`Previous 7 days`, value: "past7days" },
    { label: t`Previous 30 days`, value: "past30days" },
    { label: t`Previous month`, value: "past1months" },
    { label: t`Previous 3 months`, value: "past3months" },
    { label: t`Previous 12 months`, value: "past12months" },
  ];

  const includeTodayLabels: Partial<Record<TaskRunDateFilterOption, string>> = {
    past1days: t`Yesterday, including today`,
    past1weeks: t`Previous week, including today`,
    past7days: t`Previous 7 days, including today`,
    past30days: t`Previous 30 days, including today`,
    past1months: t`Previous month, including today`,
    past3months: t`Previous 3 months, including today`,
    past12months: t`Previous 12 months, including today`,
  };

  const selectedOption = options.find((option) => option.value === value);
  const includeTodayAllowed = isIncludeTodayAllowed(value);

  const displayLabel = (() => {
    if (!selectedOption) {
      return null;
    }
    const includeTodayLabel =
      value !== null ? includeTodayLabels[value] : undefined;
    if (includeToday && includeTodayAllowed && includeTodayLabel) {
      return includeTodayLabel;
    }
    return selectedOption.label;
  })();

  const handleClear = (event: MouseEvent) => {
    event.stopPropagation();
    emit(null, false);
  };

  const handleSelectChange = (next: string | null) => {
    if (next === null) {
      emit(null, false);
      return;
    }
    if (guardTaskRunStartedAtRange(next)) {
      emit(next, includeToday);
    }
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      withinPortal
    >
      <Popover.Target>
        <Input
          component="button"
          type="button"
          data-testid="task-run-date-picker"
          pointer
          w={PICKER_WIDTH}
          styles={{
            input: {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textAlign: "left",
              // Mantine's `rightSectionWidth` only sets a CSS variable that
              // the layered styles in this bundle don't pick up, so the input
              // padding doesn't follow the section. Override it directly so
              // long labels ellipsize instead of sliding under the icons.
              paddingInlineEnd: RIGHT_SECTION_FULL_WIDTH,
            },
            section: {
              width: "auto",
              paddingRight: "10px",
            },
          }}
          onClick={() => setOpened((open) => !open)}
          rightSection={
            <Group gap="xs" wrap="nowrap">
              {value !== null && (
                <Input.ClearButton
                  size="sm"
                  aria-label={t`Clear`}
                  style={{
                    pointerEvents: "all",
                    color: "var(--mb-color-text-primary)",
                  }}
                  onClick={handleClear}
                />
              )}
              <Combobox.Chevron />
            </Group>
          }
          rightSectionPointerEvents="none"
        >
          {displayLabel ?? (
            <Input.Placeholder c="text-disabled">
              {placeholder}
            </Input.Placeholder>
          )}
        </Input>
      </Popover.Target>

      <Popover.Dropdown p="md">
        <Stack gap="md" w={PICKER_WIDTH}>
          <Select
            data={options}
            value={value}
            aria-label={t`Date range`}
            placeholder={t`Started at`}
            comboboxProps={{
              withinPortal: false,
              floatingStrategy: "fixed",
              position: "bottom-start",
            }}
            onChange={handleSelectChange}
          />
          <Switch
            label={t`Include today`}
            checked={includeToday && includeTodayAllowed}
            disabled={!includeTodayAllowed}
            onChange={(event) => emit(value, event.currentTarget.checked)}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
