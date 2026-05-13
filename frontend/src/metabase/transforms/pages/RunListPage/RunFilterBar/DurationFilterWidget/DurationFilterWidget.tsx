import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Popover,
  Stack,
  Text,
} from "metabase/ui";

import { FILTER_WIDGET_MIN_WIDTH } from "../../../../constants";
import { FilterFieldSet } from "../FilterFieldSet";

const MS_PER_SECOND = 1000;

type DurationFilterWidgetProps = {
  minDurationMs: number | undefined;
  maxDurationMs: number | undefined;
  onChange: (value: {
    minDurationMs: number | undefined;
    maxDurationMs: number | undefined;
  }) => void;
};

export function DurationFilterWidget({
  minDurationMs,
  maxDurationMs,
  onChange,
}: DurationFilterWidgetProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  function handleRemove() {
    onChange({ minDurationMs: undefined, maxDurationMs: undefined });
  }

  function handleSubmit(value: {
    minDurationMs: number | undefined;
    maxDurationMs: number | undefined;
  }) {
    close();
    onChange(value);
  }

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <FilterFieldSet
          label={t`Duration`}
          displayValue={getDisplayValue(minDurationMs, maxDurationMs)}
          icon="clock"
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <DurationFilterForm
          minDurationMs={minDurationMs}
          maxDurationMs={maxDurationMs}
          onSubmit={handleSubmit}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

type DurationFilterFormProps = {
  minDurationMs: number | undefined;
  maxDurationMs: number | undefined;
  onSubmit: (value: {
    minDurationMs: number | undefined;
    maxDurationMs: number | undefined;
  }) => void;
};

function DurationFilterForm({
  minDurationMs: initialMinMs,
  maxDurationMs: initialMaxMs,
  onSubmit,
}: DurationFilterFormProps) {
  const [minSec, setMinSec] = useState<number | "">(toSecondsInput(initialMinMs));
  const [maxSec, setMaxSec] = useState<number | "">(toSecondsInput(initialMaxMs));

  const minMs = toMsValue(minSec);
  const maxMs = toMsValue(maxSec);
  const hasBound = minMs != null || maxMs != null;
  const rangeOk = minMs == null || maxMs == null || minMs <= maxMs;
  const isValid = hasBound && rangeOk;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onSubmit({ minDurationMs: minMs, maxDurationMs: maxMs });
    }
  };

  const hasExisting = initialMinMs != null || initialMaxMs != null;

  return (
    <Box component="form" miw={FILTER_WIDGET_MIN_WIDTH} onSubmit={handleSubmit}>
      <Stack p="md" gap="sm">
        <Text c="text-secondary" fz="sm">
          {t`Only show runs that finished and lasted within this range. In-progress runs are excluded.`}
        </Text>
        <NumberInput
          label={t`At least (seconds)`}
          value={minSec}
          min={0}
          step={1}
          allowDecimal={false}
          allowNegative={false}
          onChange={(v) => setMinSec(typeof v === "number" ? v : "")}
        />
        <NumberInput
          label={t`At most (seconds)`}
          value={maxSec}
          min={0}
          step={1}
          allowDecimal={false}
          allowNegative={false}
          error={!rangeOk ? t`Max must be ≥ min` : undefined}
          onChange={(v) => setMaxSec(typeof v === "number" ? v : "")}
        />
      </Stack>
      <Divider />
      <Group p="md" justify="end">
        <Button type="submit" variant="filled" disabled={!isValid}>
          {hasExisting ? t`Update filter` : t`Add filter`}
        </Button>
      </Group>
    </Box>
  );
}

function toSecondsInput(ms: number | undefined): number | "" {
  return ms == null ? "" : Math.round(ms / MS_PER_SECOND);
}

function toMsValue(sec: number | ""): number | undefined {
  return typeof sec === "number" && sec >= 0 ? sec * MS_PER_SECOND : undefined;
}

function getDisplayValue(
  minMs: number | undefined,
  maxMs: number | undefined,
) {
  if (minMs == null && maxMs == null) {
    return null;
  }
  const minSec = minMs != null ? Math.round(minMs / MS_PER_SECOND) : null;
  const maxSec = maxMs != null ? Math.round(maxMs / MS_PER_SECOND) : null;

  if (minSec != null && maxSec != null) {
    return t`${minSec}–${maxSec}s`;
  }
  if (minSec != null) {
    return t`≥ ${minSec}s`;
  }
  return t`≤ ${maxSec}s`;
}
