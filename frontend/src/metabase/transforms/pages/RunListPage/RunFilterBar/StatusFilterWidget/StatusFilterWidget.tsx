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
import type { TransformRunStatus } from "metabase-types/api";

import { FILTER_WIDGET_MIN_WIDTH } from "../../../../constants";
import { formatStatus } from "../../../../utils";
import { FilterFieldSet } from "../FilterFieldSet";

const STATUSES: TransformRunStatus[] = [
  "started",
  "succeeded",
  "failed",
  "timeout",
];

type StatusFilterWidgetProps = {
  label: string;
  statuses: TransformRunStatus[];
  onChange: (statuses: TransformRunStatus[]) => void;
};

export function StatusFilterWidget({
  label,
  statuses,
  onChange,
}: StatusFilterWidgetProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleSubmit = (statuses: TransformRunStatus[]) => {
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
          displayValue={getDisplayValue(statuses)}
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <StatusFilterForm statuses={statuses} onSubmit={handleSubmit} />
      </Popover.Dropdown>
    </Popover>
  );
}

function getDisplayValue(statuses: TransformRunStatus[]) {
  const count = statuses.length;
  switch (count) {
    case 0:
      return null;
    case 1:
      return formatStatus(statuses[0]);
    default:
      return ngettext(msgid`${count} status`, `${count} statuses`, count);
  }
}

type StatusFilterForm = {
  statuses: TransformRunStatus[];
  onSubmit: (statuses: TransformRunStatus[]) => void;
};

function StatusFilterForm({
  statuses: initialStatuses,
  onSubmit,
}: StatusFilterForm) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const isValid = statuses.length > 0;

  const handleChange = (values: string[]) => {
    setStatuses(values as TransformRunStatus[]);
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
        <Stack p="md">
          {STATUSES.map((status) => (
            <Checkbox
              key={status}
              value={status}
              label={formatStatus(status)}
            />
          ))}
        </Stack>
      </Checkbox.Group>
      <Divider />
      <Group p="md" justify="end">
        <Button type="submit" variant="filled" disabled={!isValid}>
          {initialStatuses.length > 0 ? `Update filter` : `Add filter`}
        </Button>
      </Group>
    </Box>
  );
}
