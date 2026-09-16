import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  DEFAULT_REASONING_EFFORT,
  getReasoningEffortLevels,
} from "metabase/metabot/reasoning-effort";
import {
  Icon,
  Popover,
  Slider,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { MetabotReasoningEffort as ReasoningEffort } from "metabase-types/api";

import S from "./MetabotReasoningEffort.module.css";

type MetabotReasoningEffortProps = {
  value: ReasoningEffort | undefined;
  onChange: (value: ReasoningEffort | undefined) => void;
  disabled?: boolean;
};

const TRACK_SIZE_PX = 28;
const THUMB_SIZE_PX = 32;

export function MetabotReasoningEffort({
  value,
  onChange,
  disabled = false,
}: MetabotReasoningEffortProps) {
  const [opened, setOpened] = useState(false);
  const levels = useMemo(getReasoningEffortLevels, []);
  const effectiveValue = value ?? DEFAULT_REASONING_EFFORT;
  const index = Math.max(
    levels.findIndex((level) => level.value === effectiveValue),
    0,
  );
  const level = levels[index];
  const marks = useMemo(
    () => levels.map((_level, markIndex) => ({ value: markIndex })),
    [levels],
  );

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-end"
      offset={10}
      width={280}
      trapFocus
      classNames={{ dropdown: S.dropdown }}
    >
      <Popover.Target>
        <Tooltip label={t`Thinking effort`} disabled={opened}>
          <UnstyledButton
            className={S.trigger}
            aria-label={t`Thinking effort`}
            aria-expanded={opened}
            data-expanded={opened || undefined}
            data-testid="metabot-reasoning-effort"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setOpened((isOpen) => !isOpen)}
          >
            <span>{opened ? t`Thinking level` : level?.label}</span>
            <Icon name="chevrondown" size={10} />
          </UnstyledButton>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Text
          className={S.title}
          fw="bold"
          fz="md"
          lh={1.3}
          ta="center"
          data-testid="reasoning-effort-title"
        >
          {level?.label}
        </Text>
        <Slider
          className={S.slider}
          classNames={{
            trackContainer: S.trackContainer,
            track: S.track,
            bar: S.bar,
            thumb: S.thumb,
            mark: S.mark,
          }}
          data-max={index === levels.length - 1 || undefined}
          thumbLabel={t`Thinking effort`}
          value={index}
          min={0}
          max={levels.length - 1}
          step={1}
          marks={marks}
          restrictToMarks
          label={null}
          size={TRACK_SIZE_PX}
          thumbSize={THUMB_SIZE_PX}
          onChange={(nextIndex) => onChange(levels[nextIndex]?.value)}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
