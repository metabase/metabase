import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { formatRunMethod } from "metabase/transforms/utils";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
} from "metabase/ui";
import type { TransformRunMethod } from "metabase-types/api";

import { FILTER_WIDGET_MIN_WIDTH } from "../../../../constants";
import { FilterFieldSet } from "../FilterFieldSet";

const RUN_METHODS: TransformRunMethod[] = ["manual", "cron"];

export function RunMethodFilterWidget({
  runMethods,
  onChange,
}: {
  runMethods: TransformRunMethod[];
  onChange: (value: TransformRunMethod[]) => void;
}) {
  const [isOpened, { toggle, close }] = useDisclosure();

  function handleRemove() {
    onChange([]);
  }

  function handleChange(value: TransformRunMethod[]) {
    close();
    onChange(value);
  }

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <FilterFieldSet
          label={t`Trigger`}
          displayValue={getDisplayValue(runMethods)}
          icon="play"
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <RunMethodFilterForm runMethods={runMethods} onSubmit={handleChange} />
      </Popover.Dropdown>
    </Popover>
  );
}

type RunMethodFilterFormProps = {
  runMethods: TransformRunMethod[];
  onSubmit: (statuses: TransformRunMethod[]) => void;
};

function RunMethodFilterForm({
  runMethods: initialRunMethods,
  onSubmit,
}: RunMethodFilterFormProps) {
  const [runMethods, setRunMethods] = useState(initialRunMethods);
  const isValid = runMethods.length > 0;

  const handleChange = (values: string[]) => {
    setRunMethods(values as TransformRunMethod[]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onSubmit(runMethods);
    }
  };

  return (
    <Box component="form" miw={FILTER_WIDGET_MIN_WIDTH} onSubmit={handleSubmit}>
      <Checkbox.Group value={runMethods} onChange={handleChange}>
        <Stack p="md">
          {RUN_METHODS.map((method) => (
            <Checkbox
              key={method}
              value={method}
              label={formatRunMethod(method)}
            />
          ))}
        </Stack>
      </Checkbox.Group>
      <Divider />
      <Group p="md" justify="end">
        <Button type="submit" variant="filled" disabled={!isValid}>
          {initialRunMethods.length > 0 ? `Update filter` : `Add filter`}
        </Button>
      </Group>
    </Box>
  );
}

function getDisplayValue(runMethods: TransformRunMethod[]) {
  if (runMethods.length === 0) {
    return null;
  }
  return runMethods.map(formatRunMethod).join(", ");
}
