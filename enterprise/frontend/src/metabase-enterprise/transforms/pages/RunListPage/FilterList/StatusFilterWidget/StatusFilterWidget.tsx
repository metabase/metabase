import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
} from "metabase/ui";
import type { TransformExecutionStatus } from "metabase-types/api";

import { formatStatus } from "../../../../utils";
import { FilterButton } from "../FilterButton";
import { MIN_WIDTH } from "../constants";

const STATUSES: TransformExecutionStatus[] = [
  "started",
  "succeeded",
  "failed",
  "timeout",
];

type StatusFilterWidgetProps = {
  statuses: TransformExecutionStatus[];
  onChange: (statuses: TransformExecutionStatus[]) => void;
};

export function StatusFilterWidget({
  statuses,
  onChange,
}: StatusFilterWidgetProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleSubmit = (statuses: TransformExecutionStatus[]) => {
    close();
    onChange(statuses);
  };

  return (
    <Popover opened={isOpened} onDismiss={close}>
      <Popover.Target>
        <FilterButton label={t`Status`} icon="check_filled" onClick={toggle} />
      </Popover.Target>
      <Popover.Dropdown>
        <StatusFilterForm statuses={statuses} onSubmit={handleSubmit} />
      </Popover.Dropdown>
    </Popover>
  );
}

type StatusFilterForm = {
  statuses: TransformExecutionStatus[];
  onSubmit: (statuses: TransformExecutionStatus[]) => void;
};

function StatusFilterForm({
  statuses: initialStatuses,
  onSubmit,
}: StatusFilterForm) {
  const [statuses, setStatuses] = useState(initialStatuses);
  const isValid = statuses.length > 0;

  const handleChange = (values: string[]) => {
    setStatuses(values as TransformExecutionStatus[]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onSubmit(statuses);
    }
  };

  return (
    <Box component="form" miw={MIN_WIDTH} onSubmit={handleSubmit}>
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
