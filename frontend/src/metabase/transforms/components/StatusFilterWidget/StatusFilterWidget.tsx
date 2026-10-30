import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { msgid, ngettext } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
} from "metabase/ui";

import { FILTER_WIDGET_MIN_WIDTH } from "../../constants";
import { FilterFieldSet } from "../FilterFieldSet";

export type StatusFilterOption<T extends string> = {
  value: T;
  label: string;
};

type StatusFilterWidgetProps<T extends string> = {
  label: string;
  statuses: T[];
  options: StatusFilterOption<T>[];
  onChange: (statuses: T[]) => void;
};

export function StatusFilterWidget<T extends string>({
  label,
  statuses,
  options,
  onChange,
}: StatusFilterWidgetProps<T>) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleSubmit = (statuses: T[]) => {
    close();
    onChange(statuses);
  };

  const handleRemove = () => {
    onChange([]);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <FilterFieldSet
          label={label}
          icon="check_filled"
          displayValue={getDisplayValue(statuses, options)}
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <StatusFilterForm
          statuses={statuses}
          options={options}
          onSubmit={handleSubmit}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function getDisplayValue<T extends string>(
  statuses: T[],
  options: StatusFilterOption<T>[],
) {
  const count = statuses.length;
  switch (count) {
    case 0:
      return null;
    case 1:
      return (
        options.find((option) => option.value === statuses[0])?.label ??
        statuses[0]
      );
    default:
      return ngettext(msgid`${count} status`, `${count} statuses`, count);
  }
}

type StatusFilterFormProps<T extends string> = {
  statuses: T[];
  options: StatusFilterOption<T>[];
  onSubmit: (statuses: T[]) => void;
};

function StatusFilterForm<T extends string>({
  statuses: initialStatuses,
  options,
  onSubmit,
}: StatusFilterFormProps<T>) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const isValid = statuses.length > 0;

  const handleChange = (values: string[]) => {
    setStatuses(
      options
        .filter((option) => values.includes(option.value))
        .map((option) => option.value),
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onSubmit(statuses);
    }
  };

  return (
    <Box component="form" miw={FILTER_WIDGET_MIN_WIDTH} onSubmit={handleSubmit}>
      <Checkbox.Group value={statuses} onChange={handleChange}>
        <Stack p="lg">
          {options.map((option) => (
            <Checkbox
              key={option.value}
              value={option.value}
              label={option.label}
            />
          ))}
        </Stack>
      </Checkbox.Group>
      <Divider />
      <Group p="lg" justify="end">
        <Button type="submit" variant="filled" disabled={!isValid}>
          {initialStatuses.length > 0 ? `Update filter` : `Add filter`}
        </Button>
      </Group>
    </Box>
  );
}
