import { useState } from "react";
import { jt, t } from "ttag";

import { Button, Group, Icon, Select, Stack } from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  type DisqualifierSteps,
  type FunnelDisqualifier,
  getDisqualifierSteps,
} from "../../analyses/funnel-disqualifiers";
import type { EventDefinition } from "../../events/types";
import type { SettingWidgetProps } from "../../settings/types";

import { EventDefinitionWidget } from "./EventDefinitionWidget";

const STEP_SELECT_WIDTH = "4.5rem";

type DisqualifierListWidgetProps = SettingWidgetProps<FunnelDisqualifier[]> & {
  table: Table | undefined;
  /** How many steps the funnel has, to pick the ones a disqualifier applies between. */
  stepCount: number;
};

/**
 * Events that end someone's attempt at the funnel, each between two of its
 * steps, by default the first and the last. Clearing an event removes it.
 */
export const DisqualifierListWidget = ({
  id,
  value,
  onChange,
  table,
  stepCount,
}: DisqualifierListWidgetProps) => {
  const [isAdding, setIsAdding] = useState(false);

  const handleChange = (
    changedIndex: number,
    changed: FunnelDisqualifier | null,
  ) =>
    onChange(
      changed === null
        ? value.filter((_disqualifier, index) => index !== changedIndex)
        : value.map((disqualifier, index) =>
            index === changedIndex ? changed : disqualifier,
          ),
    );

  const handleAdd = (event: EventDefinition | null) => {
    if (event !== null) {
      onChange([...value, { event, between: null }]);
    }
    setIsAdding(false);
  };

  return (
    <Stack id={id} gap="md">
      {value.length > 0 && (
        <Stack gap="sm" role="list">
          {value.map((disqualifier, index) => (
            <Stack
              key={index}
              gap="sm"
              p="sm"
              bg="background_page-secondary"
              bd="1px solid var(--mb-color-border-neutral-subtle)"
              bdrs="md"
              role="listitem"
            >
              <EventDefinitionWidget
                id={`${id}-${index}`}
                value={disqualifier.event}
                table={table}
                removeLabel={t`Remove`}
                onChange={(event) =>
                  handleChange(
                    index,
                    event === null ? null : { ...disqualifier, event },
                  )
                }
              />
              {stepCount >= 2 && (
                <StepRangePicker
                  steps={getDisqualifierSteps(disqualifier.between, stepCount)}
                  stepCount={stepCount}
                  onChange={(between) =>
                    handleChange(index, { ...disqualifier, between })
                  }
                />
              )}
            </Stack>
          ))}
        </Stack>
      )}
      {value.length === 0 || isAdding ? (
        <EventDefinitionWidget
          id={`${id}-new`}
          value={null}
          table={table}
          onChange={handleAdd}
        />
      ) : (
        <Button
          variant="light"
          leftSection={<Icon name="add" />}
          disabled={table === undefined}
          onClick={() => setIsAdding(true)}
        >
          {t`Add another`}
        </Button>
      )}
    </Stack>
  );
};

/** Steps `from` through `to`, numbered from 0, as select options numbered from 1. */
const getStepOptions = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, offset) => ({
    value: String(from + offset),
    label: String(from + offset + 1),
  }));

type StepRangePickerProps = {
  steps: DisqualifierSteps;
  stepCount: number;
  onChange: (steps: DisqualifierSteps) => void;
};

/** "Between steps [a] and [b]", moving the other step along to keep a before b. */
const StepRangePicker = ({
  steps,
  stepCount,
  onChange,
}: StepRangePickerProps) => {
  const lastStep = stepCount - 1;

  const handleFromChange = (selected: string | null) => {
    const fromStep = Number(selected);
    if (selected !== null && Number.isInteger(fromStep)) {
      onChange({ fromStep, toStep: Math.max(steps.toStep, fromStep + 1) });
    }
  };

  const handleToChange = (selected: string | null) => {
    const toStep = Number(selected);
    if (selected !== null && Number.isInteger(toStep)) {
      onChange({ fromStep: Math.min(steps.fromStep, toStep - 1), toStep });
    }
  };

  const fromPicker = (
    <Select
      key="from"
      w={STEP_SELECT_WIDTH}
      data={getStepOptions(0, lastStep - 1)}
      value={String(steps.fromStep)}
      allowDeselect={false}
      aria-label={t`First step`}
      onChange={handleFromChange}
    />
  );
  const toPicker = (
    <Select
      key="to"
      w={STEP_SELECT_WIDTH}
      data={getStepOptions(1, lastStep)}
      value={String(steps.toStep)}
      allowDeselect={false}
      aria-label={t`Last step`}
      onChange={handleToChange}
    />
  );

  return (
    <Group gap="sm" wrap="nowrap" justify="center">
      {jt`Between steps ${fromPicker} and ${toPicker}`}
    </Group>
  );
};
